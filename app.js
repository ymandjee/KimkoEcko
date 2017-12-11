/* jshint esversion: 6 */
require('dotenv').config();
const restify = require('restify');
const builder = require('botbuilder');
const fbuser = require('botbuilder-facebookextension');
var MongoClient = require('mongodb').MongoClient;
var collName = 'transactions';

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

//Prepare DB

MongoClient.connect(process.env.MONGODB_CONN_STRING, function (err, db) {
    if (err) throw err;
    db.createCollection(collName, function (err, res) {
        if (err) throw err;
        console.log("Collection created!");
        db.close();
    });

});

// Listen for messages from users
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector, (session, args, next) => {
    session.endDialog(`I'm sorry, I did not understand '${session.message.text}'.\nType 'help' to know more about me :)`);
});

var luisRecognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL).onEnabled(function (context, callback) {
    var enabled = context.dialogStack().length === 0;
    callback(null, enabled);
});
bot.recognizer(luisRecognizer);
bot.use(
    fbuser.RetrieveUserProfile({
        accessToken: process.env.FacebookAccessToken,
    })
);

bot.dialog('Help',
    (session, args, next) => {
        var message = `I'm the finance bot and I can help you manage your portfolio.  \n` +
            'You can tell me things like :  \n' + 
            ' _Buy 50 xef.to @ 100$ into my TFSA_.  \n' + 
            ' _Sell all my xef.to at market price_.  \n' + 
            ' _List my stocks_.  \n' + 
            'At any time, type _cancel_ to exit the current dialog';
        if (session.userData.first_name && session.userData.last_name) {
            message = 'Hi ' + session.userData.first_name + ' ' + session.userData.last_name + '! ' + message;
        }
        session.endDialog(message);
        session.send('What would you like me to do?');
    }
).triggerAction({
    matches: 'Help'
});

bot.dialog('Buy', [
    (session, args, next) => {
        var symbol = builder.EntityRecognizer.findEntity(args.intent.entities, 'Transaction::Symbol');
        var quantity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Transaction::Quantity');
        var price = builder.EntityRecognizer.findEntity(args.intent.entities, 'Transaction::Price');
        var portfolio = builder.EntityRecognizer.findEntity(args.intent.entities, 'Portfolio');

        if (symbol) {
            session.dialogData.symbol = symbol.entity;
        }

        if (quantity) {
            session.dialogData.quantity = quantity.entity;
        }

        if (price) {
            session.dialogData.price = price.entity;
        }

        if (portfolio) {
            session.dialogData.portfolio = portfolio.entity;
        }

        if (!session.dialogData.symbol) {
            builder.Prompts.text(session, 'What is the symbol of the stock you want to buy ? ');
        } else {
            next();
        }
    }, (session, result, next) => {
        if (!session.dialogData.symbol) {
            session.dialogData.symbol = result.response;
        }

        if (!session.dialogData.quantity) {
            builder.Prompts.number(session, 'How many stocks did you buy ? ');
        } else {
            next();
        }
    }, (session, result, next) => {
        if (!session.dialogData.quantity) {
            session.dialogData.quantity = result.response;
        }

        if (!session.dialogData.price) {
            builder.Prompts.number(session, 'At what price did you buy each ? ');
        } else {
            next();
        }
    }, (session, result, next) => {
        if (!session.dialogData.price) {
            session.dialogData.price = result.response;
        }

        if (!session.dialogData.portfolio) {
            builder.Prompts.choice(session, 'In which portfolio should I include the trade ? ', ["TFSA", "RRSP", "Other"]);
        } else {
            next();
        }
    },
    (session, result, next) => {

        if (!session.dialogData.portfolio) {
            session.dialogData.portfolio = result.response.entity;
        }

        var message = `I understand that you want to register the following transaction : `;
        message += '  \nAction : Buy';
        message += '  \nStock : ' + session.dialogData.symbol;
        message += '  \nQuantity : ' + session.dialogData.quantity;
        message += '  \nPrice : ' + session.dialogData.price;
        message += '  \nPortfolio : ' + session.dialogData.portfolio;

        if (session.userData.first_name && session.userData.last_name) {
            message += '  \nOwner : ' + session.userData.first_name + ' ' + session.userData.last_name;
        }
        message += '  \n\nIs that correct ?'
        builder.Prompts.confirm(session, message, { listStyle: builder.ListStyle.button });
    },
    (session, result, next) => {
        if (result.response) {
            var myobj = {
                action: 'Buy',
                stock: session.dialogData.symbol,
                quantity: session.dialogData.quantity,
                price: session.dialogData.price,
                portfolio: session.dialogData.portfolio
            };
            MongoClient.connect(process.env.MONGODB_CONN_STRING, function (err, db) {
                if (err) throw err;
                db.collection(collName).insertOne(myobj, function (err, res) {
                    if (err) throw err;
                    console.log("1 document inserted");
                    db.close();
                });
            });
            session.endDialog("confirmed");
        }
        else {
            session.endDialog("cancelled");
        }

    }
]).triggerAction({
    matches: 'Buy'
}).endConversationAction('CancelBuy', 'Operation cancelled', {
    matches: /^cancel$/,
    confirmPrompt: `Are you sure you wish to cancel?`
});

bot.dialog('Sell',
(session, args, next) => {
    session.endDialog("Sell available soon!");
}
).triggerAction({
matches: 'Sell'
});

bot.dialog('List',
    (session, args, next) => {
        MongoClient.connect(process.env.MONGODB_CONN_STRING, function (err, db) {
            if (err) throw err;
            db.collection(collName).find({}).toArray(function (err, res) {
                if (err) throw err;
                db.close();

                var message = "";
                if (res) {
                    res.forEach(function (element) {
                        message += element.action + ' ' + element.quantity + ' ' + element.stock + ' @ ' + element.price + ' into ' + element.portfolio + "  \n";
                    }, this);
                }
                else {
                    message = "You have no transactions recorded";
                }
                session.endDialog(message);
            });
        });
    }
).triggerAction({
    matches: 'List'
});