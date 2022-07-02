# Welcome to your CDK TypeScript project!

This is a example CDK project (IaC) that automates the provision of AWS CodePipeline with 3 stages.

It provisions the resources for hosting a static site on it’s storage service(s3), leveraging the cloudfront CDN to cache contents to provide users the content with high speed, performance and the most recent data. 
<br>The CI/CD pipeline uses a lambda function to invalidate all the cached assets in the cloudfront edge locations as the last stage of the pipeline. Additionally, all pipeline state changes are monitored by sending email alerts using SNS as an extra layer of caution. The provisioned resources are provided access using IAM roles and policies.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
