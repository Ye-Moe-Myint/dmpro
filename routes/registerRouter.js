const express = require('express')
const app = require('../app.js');
// create our Router object
const registerRouter = express.Router()

// require our controller
const registerController = require('../controllers/registerController')
const clinicianController = require('../controllers/clinicianController')
// route to handle the GET request for the login page
registerRouter.get('/', registerController.getRegisterPage)
registerRouter.post('/create', registerController.insertData)

// loginRouter.post('/', passport.authenticate('local', { failureRedirect: '/login', failureFlash: true }), loginController.submitLogin)

// export the router
module.exports = registerRouter