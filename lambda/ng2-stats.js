'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

Array.prototype.groupBy = function(keyGetter) {
    const map = new Map();
    this.forEach((item) => {
        const key = keyGetter(item);
        const collection = map.get(key);
        if(!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    });
    return Array.from(map).map(e => e[1]);
};

exports.handler = (event, context, callback) => {
    const done = (err, res) => {
        if(err) console.error('ENDING REQUEST FAILED', err);
        callback(null, {
            statusCode: err ? '400' : '200',
            body: err ? '{"message": "' + err.message + '"}' : JSON.stringify(res),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    };

    event.queryStringParameters = event.queryStringParameters || {};
    let token = ((event.headers || {})['Authorization'] || '').replace(/^bearer /i, '');

    switch(event.httpMethod) {
        case 'GET':
            if(/\/projects/.test(event.path)) {
                const project = decodeURIComponent(event.queryStringParameters.project);
                dynamo.get({
                    TableName: 'ng2-stats_users',
                    Key: {token: token}
                }, (err, data) => {
                    if(err || !data || !data.Item) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    dynamo.get({
                        TableName: 'ng2-stats_projects',
                        Key: {id: project}
                    }, (err, data) => {
                        if(!data || !data.Item) { // Do not create on error
                            dynamo.put({TableName: 'ng2-stats_projects', Item: {id: project, owner: token, events: []}}, done);
                            return;
                        }
                        const item = data.Item;
                        const reloads = item.events.filter(e => e.type === 'reload');
                        item.stats = {
                            requestByDuration: item.events.filter(e => e.type === 'http').groupBy(e => e.to).map(list => ({
                                to: list[0].to,
                                avg: list.reduce((now, e) => now + e.spacing, 0) / list.length
                            })).sort((list1, list2) => list2.avg - list1.avg),
                            avgJITCompileTime: reloads.reduce((now, e) => now + e.spacing, 0) / reloads.length
                        };
                        delete item.events;
                        done(err, item);
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
                dynamo.get({
                    TableName: 'ng2-stats_users',
                    Key: {token: token}
                }, (err, data) => {
                    if (err || !data || !data.Item) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    dynamo.get({
                        TableName: 'ng2-stats_projects',
                        Key: {id: project}
                    }, (err, data) => {
                        if (err || !data || !data.Item || data.Item.owner !== token) {
                            done(new Error('Cannot find project by id for authorization token'));
                            return;
                        }
                        dynamo.update({
                            TableName: 'ng2-stats_projects',
                            Key: {id: data.Item.id},
                            UpdateExpression: 'set events = list_append(events, :event)',
                            ExpressionAttributeValues: {
                                ':event': [{
                                    type: request.type,
                                    to: request.to.toString().substr(0, 256),
                                    at: request.at,
                                    spacing: request.spacing,
                                    message: (request.message || request.type).toString().substr(0, 1024),
                                    by: request.by
                                }]
                            }
                        }, done);
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
