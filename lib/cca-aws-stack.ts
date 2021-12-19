import * as cdk from '@aws-cdk/core';
import { CloudFrontWebDistribution, OriginAccessIdentity } from '@aws-cdk/aws-cloudfront';
import { BlockPublicAccess, Bucket } from '@aws-cdk/aws-s3';

import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from "@aws-cdk/aws-codepipeline-actions";
import * as codebuild from '@aws-cdk/aws-codebuild';
import {SecretValue} from "@aws-cdk/core";
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import { getLambdaCode } from '../src/Helpers'
import * as event_targets from "@aws-cdk/aws-events-targets";

export class CcaAwsStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const s3BucketName = 'uow-cca-static-website';

        // create s3 bucket
        const staticWebsiteBucket = new Bucket(this, 'UowStaticWebsiteBucket', {
            bucketName: s3BucketName,
            websiteIndexDocument: 'index.html',
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        });

        // create OAI for bucket from CloudFront
        const originAccessIdentity = new OriginAccessIdentity(this, 'OIA', {
            comment: `Created by CDK for ${s3BucketName}`
        });
        staticWebsiteBucket.grantRead(originAccessIdentity);

        // create CloudFront Distribution
        const cdn = new CloudFrontWebDistribution(this, 'UowStaticWebsiteDistribution', {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: staticWebsiteBucket,
                        originAccessIdentity: originAccessIdentity
                    },
                    behaviors: [
                        {isDefaultBehavior: true}
                    ]
                }
            ]
        });

        // create new codepipeline
        const pipeline = new codepipeline.Pipeline(this, 'CDK-test-pipeline');

        // create new sns topic and configure notification on pipeline state change
        const topic = new sns.Topic(this, 'codepipeline-status-topic');
        const topicEventTarget = new event_targets.SnsTopic(topic);
        topic.addSubscription(new subscriptions.EmailSubscription('oshan.fernando123@gmail.com'))
        const rule = pipeline.onStateChange(`CodePipelineStateChange`);
        rule.addTarget(topicEventTarget);

        // create new codebuild project
        const project = new codebuild.PipelineProject(this, 'CDK-test-codebuild',
            {environment : { buildImage: codebuild.LinuxBuildImage.STANDARD_5_0 } });

        // iam policy to s3 bucket
        const codePipelineS3Policy = new iam.PolicyStatement({
            actions: ['s3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
            resources: [`arn:aws:s3:::${s3BucketName}/*`, `arn:aws:s3:::${s3BucketName}`],
        });
        project.addToRolePolicy(codePipelineS3Policy);

        // create new input/output artifacts
        const sourceOutput = new codepipeline.Artifact();
        const buildOutput = new codepipeline.Artifact();

        // Pipeline source action
        const sourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: 'GitHubSource',
            owner: 'oshanfernando',
            repo: 'uow-cca-cw1',
            oauthToken: SecretValue.secretsManager('github-PAT', { jsonField : 'github-PAT' }),
            output: sourceOutput,
            branch: 'main',
        });
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // Pipeline Build action
        const codeBuildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project,
            input: sourceOutput,
            outputs: [buildOutput]
        });
        pipeline.addStage({
            stageName: 'Build',
            actions: [codeBuildAction],
        });

        // Lambda function to invalidate CDN cache
        const lambdaFunction = new lambda.Function(this, 'CcaAwsStack', {
            code: lambda.Code.fromInline(getLambdaCode(cdn.distributionId)),
            functionName: "test-fn",
            handler: 'index.lambda_handler',
            memorySize: 1024,
            runtime: lambda.Runtime.PYTHON_3_8
        });

        // IAM policies for lambda function
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["logs:*"],
            resources: ["arn:aws:logs:*:*:*"]
        }));
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "codepipeline:AcknowledgeJob",
                "codepipeline:GetJobDetails",
                "codepipeline:PollForJobs",
                "codepipeline:PutJobFailureResult",
                "codepipeline:PutJobSuccessResult"],
            resources: ["*"]
        }));
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "cloudfront:CreateInvalidation",
                "cloudfront:GetDistribution"],
            resources: ["*"]
        }));

        // Pipeline cache invalidation lambda invocation
        const cacheInvalidateLambdaAction = new codepipeline_actions.LambdaInvokeAction({
            actionName: 'InvalidateCache',
            lambda: lambdaFunction,
            inputs: [sourceOutput],
        });
        pipeline.addStage({
            stageName: 'InvalidateCache',
            actions: [cacheInvalidateLambdaAction],
        });

    }
}
