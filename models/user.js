const mongoose = require('mongoose')
var passportLocalMongoose=require("passport-local-mongoose");
const bcrypt = require('bcryptjs')

// define the userSchema
const userSchema = new mongoose.Schema({
    username: {type: String, required: true},
    password: {type: String, required: true},
    join_date: {type: Date, default: Date.now},
    role: {type: String, required: true},
    role_id: {type: String, required: true},
    theme: {type: String, default:'default', required: true}
});

userSchema.plugin(passportLocalMongoose);

userSchema.methods.verifyPassword = function (password, callback) {
    bcrypt.compare(password, this.password, (err, valid) => {
        callback(err, valid)
    })
}

const SALT_FACTOR = 10

// hash password before saving
userSchema.pre('save', function save(next) {
    const user = this// go to next if password field has not been modified
    if (!user.isModified('password')) {
        return next()
    }

    // auto-generate salt/hash
    bcrypt.hash(user.password, SALT_FACTOR, (err, hash) => {
        if (err) {
            return next(err)
        }
        //replace password with hash
        user.password = hash
        next()
    })
})

// compile the measurementSchemas into Model
const User = mongoose.model('User', userSchema)

module.exports = {User}
