const mongoose = require('mongoose');
const Constants = require('../../util/constants');
const Schema = mongoose.Schema;
const dayjs = require('dayjs');
const functions = require('../../util/functions');

const releaseSchema = new Schema({
    ocid: { type: String, required: true, validate: functions.isOCIDValid },
    id: {
        type: String, required: true, unique: true, validate: {
            validator: function (id) {
                const idFromOcid = this.ocid.split(Constants.OCID)[1];
                return new RegExp(`^${idFromOcid}`, 'g').test(id);
            },
            message: props => `Id de la entrega no cumple el estándar`
        }
    },
    date: {
        type: String, default: dayjs().format(), validate: [functions.isValidDateFormat, functions.isDateLessEqualToday]
    },
    tag: [{
        type: String,
        enum: Constants.TAGS,
        default: 'contract',
        required: true
    }],
    initiationType: {
        type: String,
        default: 'tender',
        enum: ['tender'],
        required: true
    },
    parties: {
        type: [require('../organization/organization')],
        validate: [functions.isEmptyArray, functions.duplicateIdsInParties, functions.moreThanOneSupplier, functions.partiesWithRepeatRoles],
        required: true,
        default: void 0
    },
    buyer: {
        type: Schema.Types.ObjectId,
        ref: 'OrganizationReference',
        required: true
    },
    planning: {
        type: require('../planning/planning'),
        required: function () { return this.tag.includes('planning'); }
    },
    tender: {
        type: require('../tender/tender'),
        required: function () {
            return (this.tag.some(tag => /(tender|award|contract)/.test(tag))
                || this.awards || this.contracts);
        }
    },
    awards: {
        type: [require('../award/award')],
        required: function () { return this.tag.some(tag => /(award)/.test(tag)); },
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    contracts: {
        type: [require('../contract/contract')],
        required: function () { return this.tag.some(tag => /contract/.test(tag)); },
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    language: {
        type: String,
        enum: Constants.LANGUAGE,
        required: true,
        default: 'es'
    },
    relatedProcesses: {
        type: [{
            id: { type: String, required: true },
            relationship: {
                type: [String],
                enum: ['framework', 'planning', 'parent', 'prior', 'unsuccessfulProcess', 'subContract', 'replacementProcess', 'renewalProcess'],
                required: true
            },
            title: { type: String, required: true },
            scheme: { type: String, required: true },
            identifier: { type: String, required: true },
            uri: { type: String, validate: functions.isURI },
            _id: false
        }],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    }
});

releaseSchema.post('validate', function (next) {
    const mainRoles = ['procuringEntity', 'buyer', 'payer'];
    let buyerIdx;
    let roles = []
    for (const [i, party] of this.parties.entries()) {
        if (party.organizationRef.name == this.buyer.name || party.organizationRef.id == this.buyer.id) {
            buyerIdx = i;
        };
        party.roles.forEach(rol => {
            if (mainRoles.includes(rol)) {
                roles.push(rol)
            };
        });
    };
    let a = new Set(roles);
    let b = new Set(mainRoles);
    let b_minus_a = new Set([...b].filter(x => !a.has(x)));
    b_minus_a = [...b_minus_a];
    if (buyerIdx) {
        this.parties[buyerIdx].roles = [...this.parties[buyerIdx].roles.concat(b_minus_a)]
    } else if (b_minus_a.length > 0) {
        this.parties.push({ roles: b_minus_a, organizationRef: this.buyer });
    };
});

module.exports = mongoose.model('Release', releaseSchema);
