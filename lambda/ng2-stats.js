'use strict';

const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();

exports.handler = (event, context, callback) => {
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const project = event.queryStringParameters.project;
    const token = event.headers['authorization'];
    dynamo.getItem({
        TableName: 'ng2-stats_users',
        Key: {token: token}
    }, (err, user) => {
        if (!user) {
            done(new Error('Cannot find user by authorization token'));
            return;
        }
        switch (event.httpMethod) {
            case 'PUT':
                dynamo.putItem({TableName: 'ng2-stats_users', Item: {token: token}}, done);
            case 'GET':
                dynamo.getItem({
                    TableName: 'ng2-stats_projects',
                    Key: {id: project}
                }, (err, data) => {
                    if (!data) { // Do not create on error
                        dynamo.putItem({TableName: 'ng2-stats_projects', Item: {id: project, events: []}}, done);
                        return;
                    }
                    done(err, data);
                });
                break;
            case 'POST':
                const request = JSON.parse(event.body);
                if (request.type !== 'routingChange' && request.type !== 'reload' && request.type !== 'error') {
                    done(new Error('Bad request type'));
                    return;
                }
                if ((request.spacing) && isNaN(parseInt(request.spacing))) || isNaN(parseInt(request.at))) {
                    done(new Error('Bad date (expect unix ms timestamp)'));
                    return;
                }
                dynamo.getItem({
                    TableName: 'ng2-stats_projects',
                    Key: {id: project}
                }, (err, data) => {
                    if (err || !data) {
                        done(err, data);
                        return;
                    }
                    data.events.push({
                        type: request.type,
                        to: request.to.toString().substr(0, 256),
                        at: request.at,
                        spacing: request.spacing,
                        message: request.message.toString().substr(0, 1024),
                        by: request.by
                    });
                    dynamo.putItem({TableName: 'ng2-stats_projects', Item: data}, done);
                });
                break;
            default:
                done(new Error('Unsupported method ' + event.httpMethod));
                break;
        }
    });

};
