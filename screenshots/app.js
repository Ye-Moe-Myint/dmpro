// Import express
const express = require('express')
// include Handlebars module
const exphbs = require('express-handlebars')
const flash = require('express-flash')  // for showing login error messages
const session = require('express-session')
const passport = require('./passport.js')
const { DateTime } = require("luxon");
const { body, validationResult } = require('express-validator')
const multer = require('multer');
const path = require("path");
require('./models')
var bodyParser = require('body-parser');
const app = express()
const mongoose = require('mongoose')
const {Patient} = require('./models/patient')
const db = mongoose.connection.on('error', err => {
    console.error(err);
    process.exit(1)
})
// configure Handlebars
app.engine(
    'hbs',
    exphbs.engine({
        defaultlayout: 'main',
        extname: 'hbs',
        helpers: {
            isIn: (str, array) => array.includes(str),
            isEmpty: array => array.length === 0,
            equals: (str1, str2) => str1 === str2,
            lte: (v1, v2) => v1 <= v2,
            gte: (v1, v2) => v1 >= v2,
            and() {
                return Array.prototype.every.call(arguments, Boolean);
            },
            eqBcg: (str) => str === "bcg",
            eqWeight: (str) => str === "weight",
            eqInsulin: (str) => str === "insulin",
            eqExercise: (str) => str === "exercise",
            isEmptyStr: (str) => str === "",
            formatDate: (date) => DateTime.fromJSDate(date).toLocaleString(DateTime.DATE_MED),
            formatTime: (date) => DateTime.fromJSDate(date).toLocaleString(DateTime.TIME_SIMPLE),
            formatDateTime: (date) => DateTime.fromJSDate(date).toLocaleString(DateTime.DATETIME_MED),
            json(context) {
                return JSON.stringify(context);
            }
        }
    })
)

// set Handlebars view engine
app.set('view engine', 'hbs')

app.use(flash())

// define where static assets live
app.use(express.static('public'))

app.use(
    session({
        // The secret used to sign session cookies (ADD ENV VAR)
        secret: process.env.SESSION_SECRET || 'keyboard cat',
        name: 'generic-name', // The cookie name (CHANGE THIS)
        saveUninitialized: false,
        resave: false,
        proxy: process.env.NODE_ENV === 'production', //  to work on Heroku
        cookie: {
            sameSite: 'strict',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 3000000 // sessions expire after 5 minutes
        },
    })
)

// use PASSPORT
app.use(passport.authenticate('session'))

// Passport Authentication middleware
const isAuthenticated = (req, res, next) => {
    // If user is not authenticated via Passport, redirect to login page
    if (!req.isAuthenticated()) {
        return res.redirect('/login')
    }
    // Otherwise, proceed to next middleware function
    return next()
}

const hasRole = (thisRole) => {
    return (req, res, next) => {
        if (!req.user) {
            res.redirect('/')
        }
        else {
            if (req.user.role == thisRole) {
                return next()
            }
            else {
                res.redirect('/')
            }
        }
    }
}

module.exports = {
    isAuthenticated,
    hasRole
}

// Set up to handle POST requests
app.use(express.json()) // needed if POST data is in JSON format
app.use(express.urlencoded({ extended: true })) // only needed for URL-encoded input

app.get('/login', (req, res) => {
    res.render('login', {flash: req.flash('error'), title: 'Login'})
})

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/login', failureFlash: true }),  // if bad login, send user back to login page
    (req, res) => {
        // login was successful, send user to home page
        if (req.user.role === 'patient') {
            res.redirect('/patient/dashboard')
        }
        else if (req.user.role === 'clinician') {
            res.redirect('/clinician/dashboard')
        }
    }
)

app.post('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
})

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
  
      cb(null, 'uploads')
  
    },
  
    filename: async function (req, file, cb) {
     // cb(null, file.fieldname + '-' + Date.now())
     const user = req.user;
     // get the patient's data
     const data = await Patient.findById(user.role_id).lean();
     const patient = data.screen_name;
     const currTime = DateTime.now().setZone('Asia/Bangkok');
     const currDate = currTime.startOf('day').toISO();
      cb(null, patient + '-' + currDate)
      var url = patient + '-' + currDate
      var imgname = url.substring(url.lastIndexOf('-')+1);
      console.log(imgname)
  
    }
  
  });
  
  const upload = multer({ storage: storage });
  const fs = require('file-system');

  app.get('/photoupload', (req, res) => {

    if (req.isAuthenticated()) {
        user = req.user;
        if (req.user.role === "patient") {
            res.render('food.hbs', {loggedIn: req.isAuthenticated(), theme: user.theme})
        }

    }
    else {
        res.render('patientDashboard.hbs', {loggedIn: req.isAuthenticated()})
    }

})

app.post('/uploadphoto', upload.single('myImage'), (req, res) => {

    var img = fs.readFileSync(req.file.path);
    console.log(img)

    var encode_image = img.toString('base64');

    // Define a JSONobject for the image attributes for saving to database

    var finalImg = {

        contentType: req.file.mimetype,

        image: Buffer.from(encode_image, 'base64')

    };

     db.collection('images').insertOne(finalImg, (err, result) => {

        console.log(result)

        if (err) return console.log(err)

        console.log('saved to database')

        res.redirect('/patient/dashboard')

    })

})

app.get('/photos', (req, res) => {

    db.collection('images').find().toArray((err, result) => {

        const imgArray = result.map(element => element._id);

        if (err) return console.log(err)

        res.send(imgArray)

    })

});

const ObjectId = require('mongodb').ObjectId;

app.get('/photo/:id', (req, res) => {

    var filename = req.params.id;
    console.log(filename)

    db.collection('images').findOne({ '_id': ObjectId(filename) }, (err, result) => {

        if (err) return console.log(err)

        res.contentType('image/jpeg');

        res.send(result.image.buffer)

    })

})

//add register router
const registerRouter = require('./routes/registerRouter')

app.use('/register', registerRouter)

const aboutRouter = require('./routes/aboutRouter')

app.use('/about', aboutRouter)

const clinicianRouter = require('./routes/clinicianRouter')

app.use('/clinician', clinicianRouter)

const patientRouter = require('./routes/patientRouter')

app.use('/patient', patientRouter)

app.get('/', (req, res) => {

    if (req.isAuthenticated()) {
        user = req.user;
        if (req.user.role === "patient") {
            res.render('index.hbs', {loggedIn: req.isAuthenticated(), theme: user.theme})
        }
        else {
            res.render('index.hbs', {loggedIn: req.isAuthenticated(), layout: "clinician"})
        }

    }
    else {
        res.render('index.hbs', {loggedIn: req.isAuthenticated()})
    }

})
app.get('*', (req, res) => {
    if (req.isAuthenticated()) {
        user = req.user;
        if (req.user.role === "patient") {
            res.status(404).render('notfound.hbs', {loggedIn: req.isAuthenticated(), theme: user.theme})
        }
        else {
            res.status(404).render('notfound.hbs', {loggedIn: req.isAuthenticated(), layout: "clinician"})
        }

    }
    else {
        res.status(404).render('notfound.hbs', {loggedIn: req.isAuthenticated()})
    }
})

// middleware to log a message each time a request arrives at the server - handy for debugging
// app.use((req, res, next) => {
//     console.log('message arrived: ' + req.method + ' ' + req.path)
//     next()
// })

// Tells the app to listen on port 3000 and logs tha tinformation to the console.
app.listen(process.env.PORT || 3000, () => {
    console.log('The library app is running!')
})
