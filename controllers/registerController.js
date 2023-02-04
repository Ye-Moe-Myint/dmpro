const {Patient} = require('../models/patient')
const {User} = require('../models/user')
// function which handles requests for displaying the login page
const getRegisterPage = (req, res) => {
    res.render('register', { layout: "patient-logged-out.hbs" })
}
const insertData = async (req, res, next) => {

        try {
            // Finds the validation errors in this request and wraps them in an object with handy functions
            const user = req.user
            // checks to see if any of the inputted measurement mins are greater than maxs
            // else display flash and not create a patient
            if (req.body.bcg) {
                if(parseFloat(req.body.bcgmin)>=parseFloat(req.body.bcgmax)){
                    req.flash('error', 'Error. BCG minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/');
                }
            }

            if (req.body.weight) {
                if(parseFloat(req.body.weightmin)>=parseFloat(req.body.weightmax)){
                    req.flash('error', 'Error. weight minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/');
                }
            }
            if (req.body.insulin) {
                if(parseFloat(req.body.insulinmin)>=parseFloat(req.body.insulinmax)){
                    req.flash('error', 'Error. insulin minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/');
                }
            }
            if (req.body.exercise) {
                if(parseFloat(req.body.exercisemin)>=parseFloat(req.body.exercisemax)){
                    req.flash('error', 'Error. exercise minimum threshold must not be equal to or exceeding maximum threshold.')
                    return res.redirect('/');
                }
            }

            // checking to see if this email is taken.
            const emailExists = await User.findOne({username: req.body.email.toLowerCase()}).lean();
            if (emailExists) {
                req.flash('error', `The email address has already been taken, please try another one.`)
                return res.redirect('/');
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
               // clinicianId: user.role_id.toString(),
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
            req.flash('success', `Successfully created new user.`)
            return res.redirect('/login')
        }catch (err) {
            return next(err)
        }
 
}

const submitRegister = (req, res) => { 
    res.redirect('/login')   // register was successful, send user to login page
} 

// exports an object, which contain function imported by router
module.exports = {
    getRegisterPage,
    insertData,
    submitRegister
}