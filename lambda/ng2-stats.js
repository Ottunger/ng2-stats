'use strict';

const crypto = require('crypto');
const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

// Array.prototype.groupBy
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
    let tokenParts = ((event.headers || {}).Authorization || '').replace(/^bearer /i, '').split(':');

    switch(event.httpMethod) {
        case 'GET':
            if(/\/users/.test(event.path)) {
                const username = decodeURIComponent(event.queryStringParameters.username);
                dynamo.get({
                    TableName: 'ng2-stats_users',
                    Key: {username: username}
                }, (err, data) => {
                    if(!data || !data.Item) {
                        done(new Error('Cannot find such user'));
                        return;
                    }
                    delete data.Item.password;
                    done(err, data.Item);
                });
            } else if(/\/projects/.test(event.path)) {
                const project = decodeURIComponent(event.queryStringParameters.project);
                dynamo.get({
                    TableName: 'ng2-stats_users',
                    Key: {username: tokenParts[0]}
                }, (err, data) => {
                    if(err || !data || !data.Item || data.Item.token !== tokenParts[1]) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    dynamo.get({
                        TableName: 'ng2-stats_projects',
                        Key: {id: project}
                    }, (err, data) => {
                        if(!data || !data.Item) { // Do not create on error
                            dynamo.put({TableName: 'ng2-stats_projects', Item: {id: project, owner: tokenParts[0], events: []}}, done);
                            return;
                        }
                        if(data.Item.owner !== tokenParts[0]) {
                            done(new Error('This project does not belong to you, please specify another project name'));
                            return;
                        }
                        const item = data.Item;
                        const reloads = item.events.filter(e => e.type === 'reload');
                        item.stats = {
                            requestByDuration: item.events.filter(e => e.type === 'http').groupBy(e => e.to).map(list => ({
                                to: list[0].to,
                                avg: list.reduce((now, e) => now + e.spacing, 0) / list.length
                            })).sort((list1, list2) => list2.avg - list1.avg),
                            avgWebpackReloadTime: reloads.reduce((now, e) => now + e.spacing, 0) / reloads.length
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
            const request = JSON.parse(event.body);
            if(/\/users/.test(event.path)) {
                const token = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2);
                const salt = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2);
                dynamo.put({TableName: 'ng2-stats_users', Item: {
                    username: request.username,
                    password: crypto.createHash('sha256').update(request.password + salt).digest('hex'),
                    email: request.email,
                    token: token,
                    salt: salt
                }}, (err) => {
                    done(err, {token: token});
                });
            } else if(/\/projects/.test(event.path)) {
                const project = decodeURIComponent(event.queryStringParameters.project);
                // Kept this one, but see https://eu-west-2.console.aws.amazon.com/apigateway/home?region=eu-west-2#/apis/ilpnvewoa0/models
                // Most of te checks are done by the REST API
                if (request.type !== 'routingChange' && request.type !== 'reload' && request.type !== 'error' && request.type !== 'http') {
                    done(new Error('Bad request type'));
                    return;
                }
                dynamo.get({
                    TableName: 'ng2-stats_users',
                    Key: {username: tokenParts[0]}
                }, (err, data) => {
                    if (err || !data || !data.Item || data.Item.token !== tokenParts[1]) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    dynamo.get({
                        TableName: 'ng2-stats_projects',
                        Key: {id: project}
                    }, (err, data) => {
                        if (err || !data || !data.Item || data.Item.owner !== tokenParts[0]) {
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
        case 'PUT':
            if(/\/users/.test(event.path)) {
                dynamo.get({
                    TableName: 'ng2-stats_users',
                    Key: {username: tokenParts[0]}
                }, (err, data) => {
                    if (err || !data || !data.Item || data.Item.token !== tokenParts[1]) {
                        done(new Error('Cannot find user by authorization token'));
                        return;
                    }
                    const token = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2);
                    dynamo.update({
                        TableName: 'ng2-stats_users',
                        Key: {username: tokenParts[0]},
                        UpdateExpression: 'set token = :token',
                        ExpressionAttributeValues: {
                            ':token': token
                        }
                    }, (err) => {
                        done(err, {token: token});
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
