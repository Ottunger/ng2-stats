# ng2-stats
A statistics tracker for ng2+

# Backend powered by AWS
Want your own?

First crete an acocunt on AWS, then install the python CLI.
create two tables on DynamoDB, users and projects.
Make sure you create a profile with sufficient permissions.

I recommand using a single profile for running and deploying... Which is what I demo here.
```bash
pip install awscli --upgrade --user
aws configure --profile lambda_accessors

aws lambda create-function --region eu-west-2 --function-name ng2-stats --zip-file fileb://ng2-stats.zip --role arn:aws:iam::016857696516:role/lambda_accessors --handler ng2-stats.handler --runtime nodejs6.10 --profile lambda_accessors --timeout 3 --memory-size 128
```

At that point, the service is up and running but is not accessible via HTTPS. We'll need to:
[ http://docs.aws.amazon.com/lambda/latest/dg/with-on-demand-https-example.html ]
[ http://docs.aws.amazon.com/lambda/latest/dg/with-on-demand-https-example-configure-event-source.html ]

```bash
aws apigateway create-rest-api --name ng2-stats --region eu-west-2 --profile lambda_accessors
aws apigateway get-rest-apis --region eu-west-2 --profile lambda_accessors

aws apigateway put-method --rest-api-id ilpnvewoa0 --resource-id re86swgq12 --http-method ANY --authorization-type NONE --region eu-west-2 --profile lambda_accessors
aws apigateway put-integration --rest-api-id ilpnvewoa0 --resource-id re86swgq12 --http-method ANY --type AWS_PROXY --uri arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-2:016857696516:function:ng2-stats/invocations --region eu-west-2 --profile lambda_accessors

aws apigateway put-method-response --rest-api-id ilpnvewoa0 --resource-id re86swgq12 --http-method ANY --status-code 200 --response-models "{\"application/json\": \"Empty\"}" --region eu-west-2 --profile lambda_accessors

aws apigateway create-deployment --rest-api-id ilpnvewoa0 --stage-name prod --region eu-west-2 --profile lambda_accessors

aws lambda add-permission --function-name ng2-stats --statement-id apigateway-test-2 --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:eu-west-2:016857696516:ilpnvewoa0/*/ANY" --region eu-west-2 --profile lambda_accessors
aws lambda add-permission --function-name ng2-stats --statement-id apigateway-prod-2 --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:eu-west-2:016857696516:ilpnvewoa0/prod/ANY" --region eu-west-2 --profile lambda_accessors
```
This is unfortunately not enough as this would be for a single endpoint.
The endpoints are split to allow for payload validation done by Amazon (models incoming into API).
The UI is friendly! [ https://eu-west-2.console.aws.amazon.com/apigateway/home?region=eu-west-2 ]

# How to use?
```bash
npm i --save-dev ng2-stats
```

Import the module into your main module, then import Ng2StatsService into your main component,
and load it with your desired options:

```js
this.ng2statsService.load({
    token: 'MYTEAMTOKEN',
    account: 'A username', // Or the user agent
    project: 'A project', // Or the document title
    reloadOnError: false // Whether to reload page when an error is thrown by ng2, its dump being reshown
});
```
