import { fileURLToPath } from "node:url";

import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { Architecture, LoggingFormat, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

export type LeadFormStackProps = StackProps & {
  spreadsheetId: string;
  /** Optional custom domain; needs an ACM certificate in us-east-1. */
  domainName?: string;
  certificateArn?: string;
  reservedConcurrency: number;
};

export class LeadFormStack extends Stack {
  constructor(scope: Construct, id: string, props: LeadFormStackProps) {
    super(scope, id, props);

    // Holds {"googleServiceAccount": {...}, "turnstileSecretKey": "..."}.
    // Created with a random placeholder; set the real value after the first deploy.
    const appSecret = new Secret(this, "AppSecret", {
      description:
        "insure-portal: Google service-account key and Turnstile secret",
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const logGroup = new LogGroup(this, "SubmitLeadLogs", {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const submitLead = new NodejsFunction(this, "SubmitLead", {
      entry: fromRoot("apps/api/src/handler.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      // Caps cost and Google Sheets quota use during a flood.
      reservedConcurrentExecutions: props.reservedConcurrency,
      loggingFormat: LoggingFormat.JSON,
      logGroup,
      environment: {
        APP_SECRET_ID: appSecret.secretArn,
        SPREADSHEET_ID: props.spreadsheetId,
        SHEET_LEADS_TAB: "Leads",
        SHEET_MEMBERS_TAB: "Members",
      },
      bundling: {
        format: OutputFormat.ESM,
        target: "node24",
        minify: true,
        sourceMap: true,
        // The Node.js runtime ships AWS SDK v3.
        externalModules: ["@aws-sdk/*"],
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
    appSecret.grantRead(submitLead);

    const api = new HttpApi(this, "Api", { createDefaultStage: false });
    api.addStage("PublicStage", {
      stageName: "$default",
      autoDeploy: true,
      // Whole-API limit (not per IP): there is no WAF in this design.
      throttle: { rateLimit: 5, burstLimit: 10 },
    });
    api.addRoutes({
      path: "/api/lead",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "SubmitLeadIntegration",
        submitLead
      ),
    });

    const siteBucket = new Bucket(this, "SiteBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new Distribution(this, "Site", {
      defaultRootObject: "index.html",
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.certificateArn
        ? Certificate.fromCertificateArn(
            this,
            "Certificate",
            props.certificateArn
          )
        : undefined,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new HttpOrigin(
            `${api.apiId}.execute-api.${this.region}.amazonaws.com`
          ),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new BucketDeployment(this, "DeploySite", {
      sources: [Source.asset(fromRoot("apps/web/dist"))],
      destinationBucket: siteBucket,
      distribution,
    });

    // Alarms show in the CloudWatch console only (no notifications configured).
    new Alarm(this, "SubmissionSpike", {
      alarmDescription: "More than 500 lead submissions in an hour",
      metric: submitLead.metricInvocations({ period: Duration.hours(1) }),
      threshold: 500,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    new Alarm(this, "SubmitErrors", {
      alarmDescription: "Lead Lambda errors or throttles",
      metric: submitLead.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    new CfnOutput(this, "SiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "AppSecretArn", { value: appSecret.secretArn });
  }
}
