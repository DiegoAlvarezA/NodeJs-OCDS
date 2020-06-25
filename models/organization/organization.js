const mongoose = require('mongoose');
const Constants = require('../../util/constants');
const functions = require('../../util/functions');
const Schema = mongoose.Schema;

const organizationSchema = new Schema({
    organizationRef: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'OrganizationReference',
        validate: functions.buyerIsNotSupplier
    },
    roles: [{ type: String, enum: Constants.ROLES, required: true }],
    _id: false
});


// organizationSchema.set('autoIndex', false);
organizationSchema.methods.toJSON = function () {
    let organization = this;
    let organizationObject = organization.toObject();
    const roles = organizationObject.roles;
    delete organizationObject.roles;
    return { ...organizationObject.organizationRef, roles };
}

module.exports = organizationSchema;