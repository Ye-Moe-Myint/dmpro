const {Patient} = require('../models/patient')
const {Measurement} = require('../models/measurement')
const {User} = require('../models/user')
const { DateTime } = require("luxon");
const {Clinician} = require('../models/clinician')
const { body, check, validationResult } = require('express-validator')
const { Note } = require('../models/note');

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

// Gets an array of dates between and including startDate and endDate
function getDatesInRange(startDate, endDate) {
    const date = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 0, 0, 0);

    const dates = [];

    while (date >= startDate) {
        dates.push(new Date(date));
        date.setDate(date.getDate() - 1);
    }

    const joinDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
    dates.push(new Date(joinDate));
    return dates;
}

// A function to get the tables formatted with the measurement values and list of dates
function getTableArray(dates, measurement) {
    const outputArray = []
    for (i in dates) {
        match = false
        for (j in measurement) {
            dataDate = new Date(measurement[j].date.getFullYear(), measurement[j].date.getMonth(), measurement[j].date.getDate(), 0, 0, 0)
            if (dates[i].getTime() === dataDate.getTime()) {
                outputArray.push(measurement[j])
                match = true
                break
            }
        }
        if (!match) {
            outputArray.push({date: dates[i], value: null})
        }
    }
    return outputArray
}

// function which handles requests for displaying patient name and measurement on clinician
// dashboard finds the most recent measurement entered by a patient and displays it
// it is highlighted if its not in the safety threshold
const getAllPatientData = async (req, res, next) => {
    const patientDashboard = []
    const user = req.user
    const currTime = DateTime.now().setZone('Asia/Bangkok'); // melb time using library
    const currDate = currTime.startOf('day').toISO()
    const todaysDate = currTime.toLocaleString(DateTime.DATETIME_MED);

    const clinician = await Clinician.findById(user.role_id.toString()).lean();

    try {
        // for each patient in the Patients collection, we search for their latest measurements within the
        // Measurements collection and store it in the patient dashboard list which is sent to the
        // clinician dashboard handlebar, along with the total number of patients for that clinician
        // and todays date

        for (let i = 0; i < clinician.patients.length; i++) {

            const patient = await Patient.findById(clinician.patients[i].toString()).lean()

            bcgmeasurement = await Measurement.findOne({patientId: clinician.patients[i].toString(), type:'bcg', date: { $gte: currDate}}).lean()
            weightmeasurement = await Measurement.findOne({patientId: clinician.patients[i].toString(), type:'weight', date: { $gte: currDate}}).lean()
            insulinmeasurement = await Measurement.findOne({patientId: clinician.patients[i].toString(), type:'insulin', date: { $gte: currDate}}).lean()
            exercisemeasurement = await Measurement.findOne({patientId: clinician.patients[i].toString(), type:'exercise', date: { $gte: currDate}}).lean()

            patientDashboard.push({
                                   patient: patient,
                                   bcg: (bcgmeasurement)?bcgmeasurement['value']:"",
                                   weight: (weightmeasurement)?weightmeasurement['value']:"",
                                   insulin: (insulinmeasurement)?insulinmeasurement['value']:"",
                                   exercise: (exercisemeasurement)?exercisemeasurement['value']:""
                                })
        }

        return res.render('clinicianDashboard', {layout: "clinician.hbs", loggedIn: req.isAuthenticated(),
            flash: req.flash('success'), errorFlash: req.flash('error'), user: clinician, data: patientDashboard,
            numPatients: clinician.patients.length, date: todaysDate})

    } catch (err) {
        return next(err)
    }
}

//controller to write notes
const writeNote = async (req, res) => {
    if (req.isAuthenticated()) {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', `Something went wrong, please enter a valid note and try again.`)
            return res.redirect(`/clinician/manage-patient/${req.body.pid}`);
        }

        try {
            if (!(req.body.pid) || !(req.body.comment)) {
                req.flash('error',"Error. Please fill out the required fields to add a note.")
                return res.redirect(`/clinician/manage-patient/${req.body.pid}`);
            }

            const patientExists = await Patient.findById(req.body.pid).lean();

            if (!(patientExists)) {
                req.flash('error',"Error. Something Went Wrong. Please try again.")
                return res.redirect(`/clinician/manage-patient/${req.body.pid}`);
            }

            // create the note and save to db
            const newNote = new Note({
                patientId: req.body.pid,
                date: DateTime.now().setZone('Asia/Bangkok').toISO(),
                comment: req.body.comment,
                color: req.body.notecolor,
            });
            await newNote.save();

            req.flash('success',"Note successfully added!")
            res.redirect(`/clinician/manage-patient/${req.body.pid}`);

        } catch(err) {
            console.log(err);
            req.flash('error',"Error Adding Note. Please Try Again")
            res.redirect(`/clinician/manage-patient/${req.body.pid}`);
        }
    } else {
        res.render('login')
    }
}

//contorller to delete note
const deleteNote = async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const patientId = req.body.pid
            const noteId = req.body.nid

            await Note.deleteOne({_id: noteId}, function (err) {
                if (err) {
                    req.flash('error',"Something went wrong deleting the note. Please try again.");
                    return res.redirect(`/clinician/manage-patient/${patientId}`);
                }
            }).clone()

            req.flash('success',"Notes updated.")
            res.redirect(`/clinician/manage-patient/${patientId}`);

        } catch(err) {
            console.log(err);
        }
    } else {
        res.render('login')
    }
}

// Controller for the patient overview page
const getPatientOverview = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            const patient = await Patient.findById(req.params.patient_id).lean()
            const user = await User.findOne({role_id: patient._id}).lean();
            const measurements = await Measurement.find({patientId: patient._id}).sort({"date": -1}).lean();
            const reqMeasurements = Object.keys(patient["measurements"])
            const notes = await Note.find({patientId: patient._id}).sort({"date": -1}).lean();

            const measurementsForChart = await Measurement.find({patientId: patient._id}).sort({"date": 1}).lean();
            const measurementsByDate = groupMeasurementsByDate(measurementsForChart);

            const clinician = await Clinician.findById(req.user.role_id.toString()).lean();

            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            return res.render('patientOverview', {loggedIn: req.isAuthenticated(), flash: req.flash('success'),
                errorFlash: req.flash('error'), layout: 'clinician.hbs', required: reqMeasurements,
                join_date: user.join_date, patient: patient, measurements: measurements, groupedByDate: measurementsByDate, notes: notes})

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }
    } else {
        res.render('login');
    }
}

// controller for patient's bcg page
const getPatientBCG = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            const patient = await Patient.findById(req.params.patient_id).lean()
            const user = await User.findOne({role_id: patient._id}).lean();
            const dates = await getDatesInRange(new Date(user.join_date), new Date())
            const measurement = await Measurement.find({patientId: req.params.patient_id.toString(), type:'bcg'}).sort({"date": -1}).lean()
            const reqMeasurements = Object.keys(patient["measurements"])
            const type = 'bcg'
            const max = patient.measurements.bcg.maximum
            const min = patient.measurements.bcg.minimum
            const unit = '(nmol/L)'

            formatted = getTableArray(dates, measurement)

            if (!patient) {
                // no patient found in database
                return res.render('notfound')
            }

            const clinician = await Clinician.findById(req.user.role_id.toString()).lean();
            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            return res.render('patientMeasurement', {loggedIn: req.isAuthenticated(), layout: 'clinician.hbs',
                join_date: user.join_date, patient: patient, required: reqMeasurements, measurement: formatted,
                type: type, max: max, min: min, unit: unit})

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }
    } else {
        res.render('login');
    }
}

// controller for patient's weight page
const getPatientWeight = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            const patient = await Patient.findById(req.params.patient_id).lean()
            const user = await User.findOne({role_id: patient._id}).lean();
            const dates = await getDatesInRange(new Date(user.join_date), new Date())

            const measurement = await Measurement.find({patientId: req.params.patient_id.toString(), type:'weight'}).sort({"date": -1}).lean()
            const reqMeasurements = Object.keys(patient["measurements"])
            const type = 'weight'
            const max = patient.measurements.weight.maximum
            const min = patient.measurements.weight.minimum
            const unit = '(kg)'

            formatted = getTableArray(dates, measurement)

            if (!patient) {
                // no patient found in database
                return res.render('notfound')
            }

            const clinician = await Clinician.findById(req.user.role_id.toString()).lean();

            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            return res.render('patientMeasurement', {loggedIn: req.isAuthenticated(), layout: 'clinician.hbs',
                join_date: user.join_date, patient: patient, required: reqMeasurements, measurement: formatted,
                type: type, max: max, min: min, unit: unit})

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }
    } else {
        res.render('login');
    }
}

// controller for patient's insulin page
const getPatientInsulin = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            const patient = await Patient.findById(req.params.patient_id).lean()
            const user = await User.findOne({role_id: patient._id}).lean();
            const dates = await getDatesInRange(new Date(user.join_date), new Date())
            const measurement = await Measurement.find({patientId: req.params.patient_id.toString(), type:'insulin'}).sort({"date": -1}).lean()
            const reqMeasurements = Object.keys(patient["measurements"])
            const type = 'insulin'
            const max = patient.measurements.insulin.maximum
            const min = patient.measurements.insulin.minimum
            const unit = '(dose(s))'

            formatted = getTableArray(dates, measurement)

            if (!patient) {
                // no patient found in database
                return res.render('notfound')
            }

            const clinician = await Clinician.findById(req.user.role_id.toString()).lean();

            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            return res.render('patientMeasurement', {loggedIn: req.isAuthenticated(), layout: 'clinician.hbs',
                join_date: user.join_date, patient: patient, required: reqMeasurements, measurement: formatted,
                type: type, max: max, min: min, unit: unit})

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }
    } else {
        res.render('login');
    }
}

// controller for patient's exercise page
const getPatientExercise = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            const patient = await Patient.findById(req.params.patient_id).lean()
            const user = await User.findOne({role_id: patient._id}).lean();
            const dates = await getDatesInRange(new Date(user.join_date), new Date())
            const measurement = await Measurement.find({patientId: req.params.patient_id.toString(), type:'exercise'}).sort({"date": -1}).lean()
            const reqMeasurements = Object.keys(patient["measurements"])
            const type = 'exercise'
            const max = patient.measurements.exercise.maximum
            const min = patient.measurements.exercise.minimum
            const unit = '(steps)'

            formatted = getTableArray(dates, measurement)

            if (!patient) {
                // no patient found in database
                return res.render('notfound')
            }

            const clinician = await Clinician.findById(req.user.role_id.toString()).lean();

            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            return res.render('patientMeasurement', {loggedIn: req.isAuthenticated(), layout: 'clinician.hbs',
                join_date: user.join_date, patient: patient, required: reqMeasurements, measurement: formatted,
                type: type, max: max, min: min, unit: unit})

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }
    } else {
        res.render('login');
    }
}
//controller to get data bounds on clinician manage
const getDataBounds = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            //retrieving patient measurements
            const patient = await Patient.findById(req.params.patient_id).lean()
            const measurement = await Measurement.find({patientId: req.params.patient_id.toString()})
            const reqMeasurements = Object.keys(patient["measurements"])
            const user = await User.findOne({role_id: patient._id}).lean();

            const clinician = await Clinician.findById(req.user.role_id.toString()).lean();

            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            //rendering to page
            res.render('clinicianManage', {layout: 'clinician.hbs', loggedIn: req.isAuthenticated(),
                flash: req.flash('success'), errorFlash: req.flash('error'), join_date: user.join_date,
                patient: patient, required: reqMeasurements})

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }
    } else {
        res.render('login');
    }
}
//controller to manage data bounds on clinician manage
const manageDataBounds = async(req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            //retrives all patient data from form
            const patientId = req.params.patient_id;
            const minbcg = req.body.minbcg;
            const maxbcg = req.body.maxbcg;
            const minweight = req.body.minweight;
            const maxweight = req.body.maxweight;
            const mindose = req.body.mindose;
            const maxdose = req.body.maxdose;
            const minsteps = req.body.minsteps;
            const maxsteps = req.body.maxsteps;

            const required_measurements = [];

            //validation to see if form is empty
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              console.log(errors);
              req.flash('error', `Something went wrong when updating values, please try again.`)
              return res.redirect(`/clinician/manage-patient/${patientId}/manage`)
            }

            if (req.body.bcg) {

                //validation to see if minimum is not larger than maximum in bcg
                if(parseFloat(minbcg)>=parseFloat(maxbcg)){
                    req.flash('error', 'Error. Blood Glucose minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect(`/clinician/manage-patient/${patientId}/manage`)
                }

                const thresholds = [];
                thresholds.push('bcg');
                if(minbcg == ""){
                    thresholds.push(0)
                }
                else{
                    thresholds.push(minbcg)
                }
                if (maxbcg) {
                    thresholds.push(maxbcg)
                }
                required_measurements.push(thresholds)
            }

            if (req.body.weight) {

                //validation to see if minimum is not larger than maximum in weight
                if(parseFloat(minweight)>=parseFloat(maxweight)){
                    req.flash('error', 'Error. Weight minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect(`/clinician/manage-patient/${patientId}/manage`)
                }

                const thresholds = [];
                thresholds.push('weight');
                if(minweight == ""){
                    thresholds.push(0)
                }
                else{
                    thresholds.push(minweight)
                }
                if (maxweight) {
                    thresholds.push(maxweight)
                }
                required_measurements.push(thresholds)
            }

            if (req.body.insulin) {

                //validation to see if minimum is not larger than maximum in dose
                if(parseFloat(mindose)>=parseFloat(maxdose)){
                    req.flash('error', 'Error. Insulin dose minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect(`/clinician/manage-patient/${patientId}/manage`)
                }

                const thresholds = [];
                thresholds.push('insulin');
                if(mindose == ""){
                    thresholds.push(0)
                }
                else{
                    thresholds.push(mindose)
                }
                if (maxdose) {
                    thresholds.push(maxdose)
                }
                required_measurements.push(thresholds)
            }

            if (req.body.exercise) {

                //validation to see if minimum is not larger than maximum in steps
                if(parseFloat(minsteps)>=parseFloat(maxsteps)){
                    req.flash('error', 'Error. Exercise minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect(`/clinician/manage-patient/${patientId}/manage`)
                }

                const thresholds = [];
                thresholds.push('exercise');
                if(minsteps == ""){
                    thresholds.push(0)
                }
                else{
                    thresholds.push(minsteps)
                }
                if (maxsteps) {
                    thresholds.push(maxsteps)
                }
                required_measurements.push(thresholds)
            }

            var measurementJson = {}
            for (let i = 0; i < required_measurements.length; i++) {
                const measurement = required_measurements[i][0];
                const min = required_measurements[i][1];
                const max = required_measurements[i][2];

                measurementJson[measurement] = {minimum: min, maximum: max}
            }

            //updating required measurements for patient
            await Patient.findByIdAndUpdate(patientId, {measurements: measurementJson});


            req.flash('success', 'Measurement thresholds successfully updated!')
            res.redirect(`/clinician/manage-patient/${patientId}/manage`)



        } catch (err) {
            return next(err)
        }
    } else {
        res.render('login');
    }
}

// function which handles requests for displaying the create form
// renders the newPatient handlebar
const getNewPatientForm = async (req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            return res.render('newPatient', {layout: 'clinician.hbs', errorFlash: req.flash('error'), loggedIn: req.isAuthenticated()})
        } catch (err) {
            return next(err)
        }
    }
    else {
        res.render('login');
    }
}

// function which handles requests for creating a new patient
// checks for validation on server side, if there are errors it doesnt create the patient
// and displays a flash error
// else if all the validation passes, it will create a new patient and user
const insertData = async (req, res, next) => {

    if (req.isAuthenticated()) {
        try {
            // Finds the validation errors in this request and wraps them in an object with handy functions
            const errors = validationResult(req);
            const user = req.user

            if (!errors.isEmpty()) {
              console.log(errors);
              req.flash('error', `Something went wrong when creating a patient, please try again.`)
              return res.redirect('/clinician/create');
            }

            // checks to see if any of the inputted measurement mins are greater than maxs
            // else display flash and not create a patient
            if (req.body.bcg) {
                if(parseFloat(req.body.bcgmin)>=parseFloat(req.body.bcgmax)){
                    req.flash('error', 'Error. BCG minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/clinician/create');
                }
            }

            if (req.body.weight) {
                if(parseFloat(req.body.weightmin)>=parseFloat(req.body.weightmax)){
                    req.flash('error', 'Error. weight minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/clinician/create');
                }
            }
            if (req.body.insulin) {
                if(parseFloat(req.body.insulinmin)>=parseFloat(req.body.insulinmax)){
                    req.flash('error', 'Error. insulin minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/clinician/create');
                }
            }
            if (req.body.exercise) {
                if(parseFloat(req.body.exercisemin)>=parseFloat(req.body.exercisemax)){
                    req.flash('error', 'Error. exercise minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/clinician/create');
                }
            }

            // checking to see if this email is taken.
            const emailExists = await User.findOne({username: req.body.email.toLowerCase()}).lean();
            if (emailExists) {
                req.flash('error', `The email address has already been taken, please try another one.`)
                return res.redirect('/clinician/create');
            }

            // const screenNameExists = await Patient.find({screen_name: req.body.screen_name}).lean();

            // if (screenNameExists) {
            //     req.flash('error', `This screen name has already been taken, please try another one.`)
            //     return res.redirect('/clinician/create');
            // }

            // first create the patient document and save to db
            const newPatient = new Patient({
                first_name: req.body.first_name,
                last_name: req.body.last_name,
                screen_name: req.body.screen_name,
                dob: req.body.dob,
                bio: req.body.bio,
                engagement_rate: 0,
                clinicianId: user.role_id.toString(),
                measurements: {}
            });

            // extract the object id from the patient document
            const patient = await newPatient.save();
            const patientId = patient._id;

            // then we create the user document and save to db
            const newUser = new User({
                username: req.body.email.toLowerCase(),
                password: req.body.password,
                role: "patient",
                role_id: patientId,
                theme: "default"
            });

            await newUser.save();


            const clinician = await Clinician.findById(user.role_id.toString()).lean()
            clinician.patients.push(patientId.toString())
            await Clinician.findByIdAndUpdate(user.role_id.toString(), {patients: clinician.patients});

            // now we get the required measurements
            // and push it to the patient document.

            const required_measurements = [];

            if (req.body.bcg) {
                const thresholds = [];
                thresholds.push(req.body.bcg);
                if (req.body.bcgmin) {
                    thresholds.push(req.body.bcgmin)
                }
                if (req.body.bcgmax) {
                    thresholds.push(req.body.bcgmax)
                }
                required_measurements.push(thresholds)
            }

            if (req.body.weight) {
                const thresholds = [];
                thresholds.push(req.body.weight);
                if (req.body.weightmin) {
                    thresholds.push(req.body.weightmin)
                }
                if (req.body.weightmax) {
                    thresholds.push(req.body.weightmax)
                }
                required_measurements.push(thresholds)
            }

            if (req.body.insulin) {
                const thresholds = [];
                thresholds.push(req.body.insulin);
                if (req.body.insulinmin) {
                    thresholds.push(req.body.insulinmin)
                }
                if (req.body.insulinmax) {
                    thresholds.push(req.body.insulinmax)
                }
                required_measurements.push(thresholds)
            }

            if (req.body.exercise) {
                const thresholds = [];
                thresholds.push(req.body.exercise);
                if (req.body.exercisemin) {
                    thresholds.push(req.body.exercisemin)
                }
                if (req.body.exercisemax) {
                    thresholds.push(req.body.exercisemax)
                }
                required_measurements.push(thresholds)
            }

            var measurementJson = {}
            for (let i = 0; i < required_measurements.length; i++) {
                const measurement = required_measurements[i][0];
                const min = required_measurements[i][1];
                const max = required_measurements[i][2];

                measurementJson[measurement] = {minimum: min, maximum: max}
            }

            await Patient.findByIdAndUpdate(patientId, {measurements: measurementJson});
            req.flash('success', `Successfully created new patient.`)
            return res.redirect('/clinician/dashboard')
        }catch (err) {
            return next(err)
        }
    } else {
        res.render('login', {layout: 'clinician.hbs'});
    }
}


// function which handles requests for displaying latest patients comments
// sorts the measurement in latest to oldest order and displays them
// rendering the patientComment handlebar
const getPatientComments = async (req, res, next) => {
    if (req.isAuthenticated()) {
        try{

            const user = req.user
            const clinician = await Clinician.findById(user.role_id.toString()).lean();

            patientComments = []

            measurement = await Measurement.find().sort({"date": -1}).lean()

            if (!measurement) {
                return res.render('notfound')
            }

            for (let i = 0; i < measurement.length; i++){
                patient = await Patient.findById(measurement[i].patientId.toString()).lean()
                if ((clinician.patients).includes(measurement[i].patientId.toString())){
                    if (measurement[i].comment != ""){
                        patientComments.push({
                            patient: patient.first_name+" "+ patient.last_name,
                            id: measurement[i].patientId,
                            type: measurement[i].type,
                            value: measurement[i].value,
                            comment: measurement[i].comment,
                            date: measurement[i].date.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}),
                        })
                    }
                }

            }

            return res.render('patientComments', {layout: "clinician.hbs", loggedIn: req.isAuthenticated(), data: patientComments})


        } catch(err){
            return next(err)
        }
    } else {
        res.render('login');
    }
}

//function to retrieve support messages and display them on clinican messages
const getSupportMessagesPage = async (req, res, next) => {

    if (req.isAuthenticated()) {
        try {
            const user = req.user;
            const clinician = await Clinician.findById(user.role_id.toString()).lean();
            const messages = {}

            for (let i = 0; i < clinician.patients.length; i++) {
                const patient = await Patient.findById(clinician.patients[i].toString()).lean()
                var patientFullName = `${patient.first_name} ${patient.last_name}`;

                messages[patientFullName] = [patient._id.toString(), patient.supportMessage];
            }

            res.render('clinicianSupportMessage', {layout: "clinician.hbs", loggedIn: req.isAuthenticated(),
                flash: req.flash('success'), errorFlash: req.flash('error'), clinician: clinician, messages: messages});

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }


    } else {
        res.render('login');
    }
}

//function to get individual patient messages
const getIndividualMessage = async (req, res) => {
    if (req.isAuthenticated()) {

        try {
            const user = req.user;
            const patient = await Patient.findById(req.params.patient_id).lean()
            const clinician = await Clinician.findById(user.role_id.toString()).lean();
            const reqMeasurements = Object.keys(patient["measurements"])
            const message = patient.supportMessage;

            // check if patient is one of clinician's patients
            if (clinician) {
                if (clinician.patients.indexOf(req.params.patient_id.toString()) > -1) {
                    // patient is one of the clinician's patients!
                    // do nothing
                }
                else {
                    // patient is not one of clinician's patients. you shall not pass!
                    req.flash('error',"Error. You are not allowed to view this patient's data.");
                    return res.redirect(`/clinician/dashboard`);
                }
            }

            res.render('individualSupportMessage', {layout: "clinician.hbs", loggedIn: req.isAuthenticated(), flash: req.flash('success'),
                errorFlash: req.flash('error'), patient: patient, join_date: user.join_date, clinician: clinician,
                message: message, required: reqMeasurements});

        } catch (err) {
            console.log(err);
            req.flash('error',"Error. Cannot find patient.");
            return res.redirect(`/clinician/dashboard`);
        }


    } else {
        res.render('login');
    }
}

//function updates individual messages for patient and displays error
//if the message is less than 3 charecters or patient id is invalid
const changeIndividualMessage = async(req, res, next) =>{

    if (req.isAuthenticated()) {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', `${errors.array()[0].msg}`)
            return res.redirect('/clinician/messages');
        }

        try{
            const message = req.body.supportMsg;
            const recipientId = req.body.recipientId;

            if (message.length <= 3) {
                req.flash('error', 'Error. Support message must be longer.')
                return res.redirect('/clinician/messages')
            }
            if (recipientId.length <= 10) {
                req.flash('error', 'Something went wrong processing your message. Please Try Again.')
                return res.redirect('/clinician/messages')
            }

            await Patient.updateOne({_id: recipientId}, {$set: {supportMessage: message}});

            req.flash('success', 'Support message successfully updated!')
            res.redirect(`/clinician/manage-patient/${recipientId}/message`)
        }catch(err){
            return next(err);
        }
    } else {
        res.render('login');
    }
}

//function to change support message for individual patients
//function displays error if message is shorter than 3 charecters
//or patient id is invalid
const changeSupportMessage = async(req, res, next) =>{

    if (req.isAuthenticated()) {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', `${errors.array()[0].msg}`)
            return res.redirect('/clinician/account');
        }

        try{
            const message = req.body.supportMsg;
            const recipientId = req.body.recipientId;

            if (message.length <= 3) {
                req.flash('error', 'Error. Support message must be longer.')
                return res.redirect('/clinician/messages')
            }
            if (recipientId.length <= 10) {
                req.flash('error', 'Something went wrong processing your message. Please Try Again.')
                return res.redirect('/clinician/messages')
            }

            await Patient.updateOne({_id: recipientId}, {$set: {supportMessage: message}});

            req.flash('success', 'Support message successfully updated!')
            res.redirect('/clinician/messages')
        }catch(err){
            return next(err);
        }
    } else {
        res.render('login');
    }
}

//function to login to clincian account
const getAccountPage = async (req, res) => {
    if (req.isAuthenticated()) {
        res.render('clinicianAccount.hbs', {layout:"clinician.hbs", loggedIn: req.isAuthenticated(),
            flash: req.flash('success'), errorFlash: req.flash('error')});
    } else {
        res.render('login');
	}
}

//function to change passowrd with validations
//password cannot be empty, password cannot have length less than 8
//also checks if the password matches
const changePassword = async (req, res) => {

    if (req.isAuthenticated()) {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', `${errors.array()[0].msg}`)
            return res.redirect('/clinician/account');
        }

        const user = req.user;
        const pw = req.body.curr_pw
        const new_pw = req.body.new_pw
        const confirm_pw = req.body.confirm_new_pw

        const retrieved_user = await User.findById(user._id)

        if (new_pw !== confirm_pw) {
            req.flash('error', `Passwords do not match`)
            res.redirect('/clinician/account');
        }
        if ((new_pw.length < 8) || (confirm_pw.length < 8)) {
            req.flash('error', `Passwords must be at least 8 characters long!`)
            res.redirect('/clinician/account');
        }

        retrieved_user.verifyPassword(pw, async (err, valid) => {
            if (!err) {
                // if the password matches
                if (valid) {
                    if (pw === new_pw) {
                        req.flash('error', 'New password cannot be the same as your current password.')
                        res.redirect('/clinician/account');
                    }
                    else {
                        retrieved_user.password = new_pw;
                        await retrieved_user.save();
                        req.flash('success', 'Password Successfully Changed.')
                        res.redirect('/clinician/account');
                    }
                } else {
                    req.flash('error', 'Password is incorrect. Try again.')
                    res.redirect('/clinician/account');
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

// using express validator we valid the create new patient forms, change password and manage data bounds
const validate = (method) =>{
    switch (method) {
        case 'insertData': {
         return [
            body('first_name', 'first_name invalid').exists().isAlphanumeric().escape(),
            body('last_name', 'last_name invalid').exists().isAlphanumeric().escape(),
            body('screen_name', 'screen_name invalid').exists().escape(),
            body('email', 'Invalid email').exists().isEmail().escape(),
            body('password', 'password invalid').exists().isLength({min:8}).escape(),//isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1}),
            body('dob', 'userName invalid').exists().isDate().escape(),
            body('bio', 'bio invalid').exists().escape(),
            body('bcgmin','invalid bcg min').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
            body('bcgmax','invalid bcg max').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
            body('weightmin','invalid weight min').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
            body('weightmax','invalid weight max').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
            body('insulinmin','invalid insulin min').optional({checkFalsy: true}).isInt({min:0, max:500}).escape(),
            body('insulinmax','invalid insulin max').optional({checkFalsy: true}).isInt({min:0, max:500}).escape(),
            body('exercisemin','invalid exercise min').optional({checkFalsy: true}).isInt({min:0, max:50000}).escape(),
            body('exercisemax','invalid exercise max').optional({checkFalsy: true}).isInt({min:0, max:50000}).escape(),
            ]
        }
        case 'changePassword': {
            return [
                    body("new_pw", "invalid password")
                        .isLength({ min: 8 })
                        .custom((value,{req, loc, path}) => {
                            if (value !== req.body.confirm_new_pw) {
                                // trow error if passwords do not match
                                throw new Error("Passwords don't match");
                            } else {
                                return value;
                            }
                        })
                    ]
        }
        case 'manageDataBounds':{
            return [
                body('minbcg', 'invalid min bcg').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
                body('maxbcg', 'invalid max bcg').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
                body('minweight', 'invalid min weight').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
                body('maxweight', 'invalid max weight').optional({checkFalsy: true}).isFloat({min:0, max:1000}).escape(),
                body('mindose', 'invalid min insulin').optional({checkFalsy: true}).isInt({min:0, max:500}).escape(),
                body('maxdose', 'invalid max insulin').optional({checkFalsy: true}).isInt({min:0, max:500}).escape(),
                body('minsteps', 'invalid min exercise').optional({checkFalsy: true}).isInt({min:0, max:50000}).escape(),
                body('maxsteps', 'invalid max exercise').optional({checkFalsy: true}).isInt({min:0, max:50000}).escape(),
            ]
        }
    }

}

// exports an object, which contain functions imported by router
module.exports = {
    getAllPatientData,
    getPatientOverview,
    getPatientBCG,
    getPatientWeight,
    getPatientInsulin,
    getPatientExercise,
    getDataBounds,
    manageDataBounds,
    insertData,
    getNewPatientForm,
    getPatientComments,
    getAccountPage,
    changePassword,
    changeSupportMessage,
    getSupportMessagesPage,
    getIndividualMessage,
    changeIndividualMessage,
    validate,
    writeNote,
    deleteNote
}
