/* jshint esversion: 6 */
require('dotenv').config();
const restify = require('restify');
const builder = require('botbuilder');
const fbuser = require('botbuilder-facebookextension');

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
    var message = `I'm the finance bot and I can help you manage your portfolio.\n` +
    `You can tell me things like _Show me my portfolio_ or _I just bought some stocks_.`;
    if(session.userData.first_name && session.userData.last_name)
    {
        message = 'Hi ' + session.userData.first_name + ' ' + session.userData.last_name + '! ' + message;
    }
    session.endDialog(message);
    session.send('What would you like me to do?.');
}
).triggerAction({
matches: 'Help'
});