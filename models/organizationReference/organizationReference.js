const mongoose = require('mongoose');
const Constants = require('../../util/constants');
const Schema = mongoose.Schema;
const functions = require('../../util/functions');

const organizationSchema = new Schema({
    id: {
        type: String, required: true, unique: true
    },
    name: { type: String, unique: true, required: true },
    identifier: {
        scheme: { type: String, required: true, enum: Constants.SCHEME },
        id: { type: String, unique: true, required: true },
        legalName: { type: String, unique: true },
        uri: { type: String, validate: functions.isURI }
    },
    additionalIdentifiers: {
        scheme: String,
        id: String,
        legalName: String,
        uri: { type: String, validate: functions.isURI }
    },
    address: {
        streetAddress: String,
        locality: String,
        region: String,
        postalCode: String,
        countryName: String
    },
    contactPoint: {
        name: String,
        email: String,
        telephone: String,
        faxNumber: String,
        url: { type: String, validate: functions.isURL }
    },
    details: Object,
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
});
organizationSchema.index({ id: 1, name: 1 }, { unique: true, sparse: true })
// organizationSchema.methods.toJSON = function () {
//     let organization = this;
//     let organizationObject = organization.toObject();
//     delete organizationObject.user;
//     return organizationObject;
// }

module.exports = mongoose.model('OrganizationReference', organizationSchema);