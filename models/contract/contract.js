const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const dayjs = require('dayjs');
const Constants = require('../../util/constants');
const functions = require('../../util/functions');

const contractSchema = new Schema({
    id: { type: String, required: true },
    awardID: {
        type: String,
        required: function () {
            if (!functions.moreThanOneSupplier.validator(this.parent().parties) || this.parent().awards) {
                return true;
            } else {
                return false;
            }
            //return !functions.moreThanOneSupplier.validator(this.parent().parties) ? true : false;
        },
        validate: {
            validator: function (awardID) {
                const that = this;
                const release = that.parent();
                let award;
                if (release.awards && release.awards.length) {
                    award = release.awards.find(award => {
                        if (award.status == 'active' && award.id == awardID) {
                            return award;
                        }
                    });
                };
                return award ? true : false;
            },
            message: function (props) { return `El awardID ${props.value} no esta entre el bloque de awards (adjudicaciones), o la adjudicación no se encuentra activa`; }
        }
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: Constants.CONTRACT_STATUS, required: true },
    period: {
        type: require('../commons/period'),
        required: true
    },
    value: {
        type: require('../commons/amount'),
        required: true
    },
    items: {
        type: [require('../commons/item')],
        default: void 0
    },
    dateSigned: {
        type: String,
        required: function () { return /active|terminated/.test(this.status); },
        validate: [functions.isValidDateFormat, functions.isDateLessEqualToday]
    },
    documents: {
        type: [require('../commons/document')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    implementation: {
        type: [require('../implementation/implementation')],
        validate: [functions.isEmptyArray],
        default: void 0
    },
    relatedProcesses: {
        type: [{
            id: { type: String, required: true },
            relationship: {
                type: [String],
                enum: ['framework', 'planning', 'parent', 'prior', 'unsuccessfulProcess', 'subContract', 'replacementProcess', 'renewalProcess'],
                default: void 0
            },
            title: String,
            scheme: {
                type: String,
                default: 'ocid',
                enum: ['ocid']
            },
            identifier: { type: String, required: true, validate: functions.isOCIDValid },
            uri: { type: String, validate: functions.isURI },
        }],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    milestones: {
        type: [require('../commons/milestone')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    amendments: {
        type: [require('../commons/amendment')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    _id: false
});

module.exports = contractSchema;