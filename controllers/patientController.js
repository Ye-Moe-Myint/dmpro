const {Patient} = require('../models/patient')
const {Measurement} = require('../models/measurement')
const { DateTime } = require("luxon");
const { User } = require('../models/user');
const bcrypt = require('bcryptjs');
const e = require('connect-flash');
const { redirect } = require('express/lib/response');
const { body, validationResult } = require('express-validator');
const { Clinician } = require('../models/clinician');
var fs = require('fs');
var path = require('path');

// const { isAuthenticated } = require('../app.js');

const getMeasurementPage = async (req, res) => {

    if (req.isAuthenticated()) {
        // get logged in user id
        const user = req.user
        // get current melbourne time using luxon
        const currTime = DateTime.now().setZone('Asia/Bangkok');
        // get the beginning of the the current day
        const currDate = currTime.startOf('day').toISO();
        const displayTime = currTime.toLocaleString(DateTime.DATETIME_MED)
        // get the patient's data
        const data = await Patient.findById(user.role_id).lean();
        // get the patient's recorded data today
        const todayData = await Measurement.find({patientId: user.role_id, date: { $gte: currDate}}).lean();

        // get the patients required measurements.
        const reqMeasurements = Object.keys(data["measurements"])
        // get the measurments that have already been recorded for today
        const alreadyMeasured = getMeasurementTypes(todayData);
        // get the measurements that havent been recorded today
        const notMeasured = reqMeasurements.filter(x => !alreadyMeasured.includes(x));

        if (data) {
            res.render('record.hbs', {loggedIn: req.isAuthenticated(), flash: req.flash('success'), errorFlash: req.flash('error'),
                                        title: "Record", theme: user.theme, singlePatient: data, measured: alreadyMeasured,
                                        notMeasured: notMeasured,  required: reqMeasurements, currentTime: displayTime})
        } else {
            console.log("patient data not found")
            res.render('notfound')
        }
    }
    else {
        res.render('login');
    }
}

// helper function to determine the type of measurement (bcg, insulin, etc.)
function getMeasurementTypes(arr) {
    const types = []
    for (let i = 0; i < arr.length; i++) {
        types.push(arr[i].type);
    }
    return types;
}

function countEngagedDays(measurements) {
    const datesMeasured = {};

    for (let i = 0; i < measurements.length; i++) {
        var time = new Date(measurements[i].date.getFullYear(), measurements[i].date.getMonth(), measurements[i].date.getDate(), 0, 0, 0);

        // if this date doesnt exist in the object, insert and initialize an empty dict.
        if (!(time in datesMeasured)) {
            datesMeasured[time] = {};
        }

        // add the measurement for this current data
        datesMeasured[time] = []
    }
    return Object.keys(datesMeasured).length;
}

async function calcEngagementAll() {
    const allPatients = await Patient.find().lean()

    for (let i = 0; i < allPatients.length; i++) {

        const engRate = await calcEngagementRate(allPatients[i]);

        while (1) {
            if (engRate) {
                await Patient.updateOne({_id: allPatients[i]._id}, {$set:{engagement_rate: engRate}})
                break;
            }
        }

    }
}

async function calcEngagementRate(patientData) {
    // Get patient ID
    const patientId = patientData._id;
    // get current bangkok time using luxon
    const currTime = DateTime.now().setZone('Asia/Bangkok');
    // get the beginning of the current day
    const currDate = currTime.startOf('day').toISO();
    // Get yesterdays date
    const yesterdayDate = currTime.minus({ days: 1});

    // get the patient's user data
    const userData = await User.findOne({role_id: patientId}).lean();

    const join_date = DateTime.fromISO(userData.join_date.toISOString()).setZone('Asia/Bangkok');

    // get the patient's recorded data up until yesterday
    const measurementData = await Measurement.find({patientId: patientId}).lean();

    // get number of days user has been on platform
    const joinLength = yesterdayDate.diff(join_date, ["days"]).toObject()['days'];

    // if this patient never measured a single thing before, just set engagement rate to zero.
    if (measurementData.length <= 0) {
        const engRate = 0;
        return engRate
    }
    else {
        // calculate engagement rate
        const engRate = countEngagedDays(measurementData) / joinLength;
        //console.log(engRate);
        return Math.floor(engRate*100)
    }
}

// this function instantiates a new measurement object and saves it to the db
const submitMeasurement = async (req, res, next) => {
    if (req.isAuthenticated()) {
        const id = req.user.role_id

        const currTime = DateTime.now().setZone('Asia/Bankok');
        const currDate = currTime.startOf('day').toISO();

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', `Something went wrong, please enter valid data and try again.`)
            return res.redirect('/patient/record');
        }

        if (req.body.value < 0) {
            req.flash('error', `Measurement values must be a positive number.`)
            return res.redirect('/patient/record');
        }

        try {
            const newMeasurement = new Measurement ({
                type: req.body.type,
                patientId: id,
                value: parseFloat(req.body.value),
                date: DateTime.now().setZone('Asia/Bangkok').toISO(),
                comment: req.body.comment,
            })
            // Checks if first measurement of the day then updates the engagement rate of all users
            if ((await Measurement.find({date:{$gte: currDate}})).length == 0) {
                calcEngagementAll();
            }

            await newMeasurement.save();
            // console.log("Measurement successfully saved to db")
            if (req.body.type === "bcg") {
                req.flash('success', "blood glucose level successfully recorded.")
            }
            else {
                req.flash('success', `${req.body.type} successfully recorded.`)
            }

            res.redirect('/patient/record');
        } catch (err) {
            next(err);
        }
    }
    else {
        res.render('login');
    }
}

// this function renders the patient dashboard page
const getPatientPage = async (req, res) => {

    if (req.isAuthenticated()) {
        const user = req.user
        const currTime = DateTime.now().setZone('Asia/Bangkok');
        const currDate = currTime.startOf('day').toISO();
        // get the patient's data
        //const data = await Patient.findById(user.role_id).lean();
        const data = await Patient.findById(user.role_id).lean();
        // get the patient's recorded data today
        const todayData = await Measurement.find({patientId: user.role_id, date: { $gte: currDate}}).lean();
        const clinician = await Clinician.findById(data.clinicianId).lean();

        // get the patients required measurements.
        const reqMeasurements = Object.keys(data["measurements"]);
        // get the measurments that have already been recorded for today
        const alreadyMeasured = getMeasurementTypes(todayData);
        // get the measurements that havent been recorded today
        const notMeasured = reqMeasurements.filter(x => !alreadyMeasured.includes(x));
        // format the date for presentation
        const dob = data.dob.getDate().toString().padStart(2,"0") + "/" +
            (data.dob.getMonth() + 1).toString().padStart(2,"0") + "/" + data.dob.getFullYear().toString()



        var leaderboardEntries = await Patient.find().sort({engagement_rate: -1}).lean();
        leaderboardEntries = leaderboardEntries.slice(0, 5);

        if (data) {
            res.render('patientDashboard.hbs', {loggedIn: req.isAuthenticated(), title: "Dashboard", theme: user.theme, dob, singlePatient: data,
                measured: alreadyMeasured, notMeasured: notMeasured, required: reqMeasurements, clinician: clinician, entry: leaderboardEntries})
        } else {
            console.log("patient data not found")
            res.render('notfound')
        }
    }
    else {
        res.render('login')
    }
}

const redirectToDashboard = async (req, res) => {
    res.redirect('/patient/dashboard');
}

const getPatientAccountPage = async (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user
        // get the patient's data
        const data = await Patient.findById(user.role_id).lean();
        const currTime = DateTime.now().setZone('Asia/Bangkok');

        // format the date for presentation
        const dob = data.dob.getDate().toString().padStart(2,"0") + "/" +
            (data.dob.getMonth() + 1).toString().padStart(2,"0") + "/" + data.dob.getFullYear().toString()

        const age = currTime.year - data.dob.getFullYear()

        if (data) {
            res.render('account', {loggedIn: req.isAuthenticated(), flash: req.flash('success'), errorFlash: req.flash('error'),
                title: "Account", age: age.toString(), singlePatient: data, theme: user.theme})
        } else {
            res.render('notfound')
        }
    }
    else {
        res.render('login')
    }
}

const changePassword = async (req, res) => {

    if (req.isAuthenticated()) {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', `${errors.array()[0].msg}`)
            return res.redirect('/patient/account');
        }

        const user = req.user;
        const pw = req.body.curr_pw
        const new_pw = req.body.new_pw
        const confirm_pw = req.body.confirm_new_pw

        const retrieved_user = await User.findById(user._id)

        if (new_pw !== confirm_pw) {
            req.flash('error', `Passwords do not match`)
            return res.redirect('/patient/account');
        }
        if ((new_pw.length < 8) || (confirm_pw.length < 8)) {
            req.flash('error', `Passwords must be at least 8 characters long!`)
            return res.redirect('/patient/account');
        }

        retrieved_user.verifyPassword(pw, async (err, valid) => {
            if (!err) {
                // if the password matches
                if (valid) {
                    if (pw === new_pw) {
                        req.flash('error', 'New password cannot be the same as your current password.')
                        res.redirect('/patient/account');
                    }
                    else {
                        retrieved_user.password = new_pw;
                        await retrieved_user.save();
                        req.flash('success', 'Password Successfully Changed.')
                        res.redirect('/patient/account');
                    }
                } else {
                    req.flash('error', 'Password is incorrect. Try again.')
                    res.redirect('/patient/account');
                }
            } else {
                res.send(err);
            }
        });
    }
    else {
        res.render('login');
    }
}

const changeTheme = async (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user
        const retrieved_user = await User.findById(user._id)
        retrieved_user.theme = req.body.theme

        try {
            await retrieved_user.save()
            req.flash('success', `Successfully changed to ${req.body.theme} theme.`)
            res.redirect('/patient/account');
        }
        catch (err) {
            console.log(err)
        }
    }
    else {
        res.render('login');
    }
}



const getPatientDataPage = async (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user;
        const measurements = await Measurement.find({patientId: user.role_id}).sort({"date": 1}).lean();
        const data = await Patient.findById(user.role_id).lean();
        const reqMeasurements = Object.keys(data["measurements"])

        // group measurements by date to be used in chart.
        const measurementsByDate = groupMeasurementsByDate(measurements);

        // convert dates to more readable format.
        for (let i = 0; i < measurements.length; i++) {
            var convertedDate = measurements[i].date;
            measurements[i].date = convertedDate.toLocaleString(DateTime.DATETIME_MED);
        }

        res.render('patientData', {loggedIn: req.isAuthenticated(), title: "Your Data", theme: user.theme, required: reqMeasurements,
            measurement: measurements, groupedByDate: measurementsByDate});
    }
    else {
        res.render('login');
    }
}

// this function aggragates measurements by date, mainly used for charts
function groupMeasurementsByDate(measurements) {
    const groupedData = {};

    for (let i = 0; i < measurements.length; i++) {
        var time = new Date(measurements[i].date.getFullYear(), measurements[i].date.getMonth(), measurements[i].date.getDate(), 0, 0, 0);

        // if this date doesnt exist in the object, insert and initialize an empty dict.
        if (!(time in groupedData)) {
            groupedData[time] = {};
        }

        // add the measurement for this current data
        groupedData[time][measurements[i].type] = measurements[i].value
    }

    return groupedData;
}
//var imgModel = require('../models');

// const getFood= async (req, res, next) => {
//     if (req.isAuthenticated()) {
//         try {

//             return res.render('food', {layout: 'patient-logged-out.hbs', errorFlash: req.flash('error'), loggedIn: req.isAuthenticated()})
//         } catch (err) {
//             return next(err)
//         }
//     }
//     else {
//         res.render('/patient/dashboard');
//     }
// }

// const submitFood= async (req, res, next) => {
//     if (req.isAuthenticated()) {
//         try {
//             var multer = require('multer');
 
//             var storage = multer.diskStorage({
//                 destination: (req, file, cb) => {
//                     cb(null, 'uploads')
//                 },
//                 filename: (req, file, cb) => {
//                     cb(null, file.fieldname + '-' + Date.now())
//                 }
//             })
//             var upload = multer({ storage: storage });
//             var obj = {
//                 name: req.body.name,
//                 desc: req.body.desc,
//                 img: {
//                     data: fs.readFileSync(path.join(__dirname + '/uploads/' + req.file.filename)),
//                     contentType: 'image/png'
//                 }
//             }
//             imgModel.create(obj, (err, item) => {
//                 if (err) {
//                     console.log(err);
//                 }
//                 else {
//                     // item.save();
//                     res.redirect('/patinet/dashboard');
//                 }
//             });
//         } catch (err) {
//             return next(err)
//         }
//     }
//     else {
//         res.render('login');
//     }
// }
const getFood = async (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user
        res.render('food.hbs', {loggedIn: req.isAuthenticated(), theme: req.user.theme})
    }
    else {
        res.render('food.hbs', {loggedIn: req.isAuthenticated()})
    }

}

// exports an object, which contain functions imported by router
module.exports = {
    getMeasurementPage,
    submitMeasurement,
    getPatientPage,
    redirectToDashboard,
    getPatientAccountPage,
    changePassword,
    changeTheme,
    getPatientDataPage,
    getFood
}
