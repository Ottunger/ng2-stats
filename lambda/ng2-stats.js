'use strict';

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

exports.handler = (event, context, callback) => {
    const done = (err, res) => {
        if(err) console.error('ENDING REQUEST FAILED', err);
        callback(null, {
            statusCode: err ? '400' : '200',
            body: err ? '{"message": "' + err.message + '"}' : JSON.stringify(res),
            headers: {
                'Content-Type': 'application/json',
            },
        });
    };

    event.queryStringParameters = event.queryStringParameters || {};
    let token = ((event.headers || {})['Authorization'] || '').replace(/^bearer /i, '');

    switch(event.httpMethod) {
        case 'GET':
            if(/\/projects/.test(event.path)) {
                const project = decodeURIComponent(event.queryStringParameters.project);
                dynamo.getItem({
                    TableName: 'ng2-stats_users',
                    Key: {token: token}
                }, (err, user) => {
                    if(!user.Item) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    dynamo.getItem({
                        TableName: 'ng2-stats_projects',
                        Key: {id: project}
                    }, (err, data) => {
                        if(!data.Item) { // Do not create on error
                            dynamo.putItem({TableName: 'ng2-stats_projects', Item: {id: project, owner: token, events: []}}, done);
                            return;
                        }
                        done(err, data.Item);
                    });
                });
            } else {
                done(new Error('Unsupported action ' + event.httpMethod + ' ' + event.path));
            }
            break;
        case 'POST':
            if(/\/users/.test(event.path)) {
                token = JSON.parse(event.body).token;
                dynamo.putItem({TableName: 'ng2-stats_users', Item: {token: token}}, done);
            } else if(/\/projects/.test(event.path)) {
                const request = JSON.parse(event.body);
                const project = decodeURIComponent(event.queryStringParameters.project);
                // Kept this one, but see https://eu-west-2.console.aws.amazon.com/apigateway/home?region=eu-west-2#/apis/ilpnvewoa0/models
                // Most of te checks are done by the REST API
                if (request.type !== 'routingChange' && request.type !== 'reload' && request.type !== 'error' && request.type !== 'http') {
                    done(new Error('Bad request type'));
                    return;
                }
                dynamo.getItem({
                    TableName: 'ng2-stats_users',
                    Key: {token: token}
                }, (err, user) => {
                    if (!user.Item) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    dynamo.getItem({
                        TableName: 'ng2-stats_projects',
                        Key: {id: project}
                    }, (err, data) => {
                        if (err || !data.Item || data.Item.owner !== token) {
                            done(new Error('Cannot find project by id for authorization token'));
                            return;
                        }
                        data.Item.events.push({
                            type: request.type,
                            to: request.to.toString().substr(0, 256),
                            at: request.at,
                            spacing: request.spacing,
                            message: request.message.toString().substr(0, 1024),
                            by: request.by
                        });
                        dynamo.putItem({TableName: 'ng2-stats_projects', Item: data.Item}, done);
                    });
                });
            } else {
                done(new Error('Unsupported action ' + event.httpMethod + ' ' + event.path));
            }
            break;
        default:
            done(new Error('Unsupported method ' + event.httpMethod));
            break;
    }
};
