var mongoose = require('mongoose');
 
var imageSchema = new mongoose.Schema({
    name: String,
    desc: String,
    img:
    {
        data: Buffer,
        contentType: String
    }
});

// compile the messageSchema into Model
const Image = mongoose.model('Image', imageSchema)

module.exports = {Image}