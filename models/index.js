// Load envioronment variables
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

// setup Mongoose
const mongoose = require('mongoose')
var { User } = require('./user')
// Connect to your mongo database using the MONGO_URL environment variable.
// Locally, MONGO_URL will be loaded by dotenv from .env.
mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'CUT2DM'
})
    .then(() => {
        console.log(`Connection success.`)
    })
    .catch(err => {
        console.log("Connection to Mongo failed.")
    })

// Exit on error
const db = mongoose.connection.on('error', err => {
    console.error(err);
    process.exit(1)
})

// Log to console once the database is open
db.once('open', async () => {
    console.log(`Mongo connection started on ${db.host}:${db.port}`)
})

// create a user a new user
//var testUser = new User({
    //username: "lieo@gmail.com",
    //password: "Lieo1234",
    //role: "patient",
    //role_id: "63d03d13120621d12404bccd",
  //  clinicianId: "63d03826120621d12404bcc5"
//});

// save user to database
//testUser.save(function (err) {
  //  if (err) throw err;
//})
require('./patient')
require('./measurement')
require('./message')
require('./note')
require('./user')