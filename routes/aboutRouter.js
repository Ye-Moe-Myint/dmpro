const express = require('express')

// create our Router object
const aboutRouter = express.Router()

// require our controller
const aboutController = require('../controllers/aboutController')

// route to handle the GET request for About Diabetes
aboutRouter.get('/diabetes', aboutController.getAboutDiabetes)
// route to handle the GET request for About Food
aboutRouter.get('/food', aboutController.getAboutFood)
// route to handle the GET request for About Exercise
aboutRouter.get('/exercise', aboutController.getAboutExercise)
// route to handle the GET request for About Website
aboutRouter.get('/website', aboutController.getAboutWebsite)

// export the router
module.exports = aboutRouter
