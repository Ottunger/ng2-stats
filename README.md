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
aws lambda create-function --region eu-west-2 --function-name ng2-stats --zip-file fileb://ng2-stats.zip --role
arn:aws:iam::016857696516:role/lambda_accessors --handler ng2-stats.handler --runtime nodejs6.10 --profile lambda_accessors --timeout 3 --memory-size 128
```

At that point, the service is up and running but is not accessible via HTTPS. We'll need [ http://docs.aws.amazon.com/lambda/latest/dg/with-on-demand-https-example.html ]
```bash
aws apigateway create-rest-api --name ng2-stats --region eu-west-2 --profile lambda_accessors
```
[ http://docs.aws.amazon.com/lambda/latest/dg/with-on-demand-https-example-configure-event-source.html ]


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
