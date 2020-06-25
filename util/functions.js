const constants = require('./constants');
const dayjs = require('dayjs');

module.exports = {
    areIdsDuplicate: {
        validator: array => {
            const ids = array.map(item => {
                return item.id
            });
            if (ids.filter((id, index) => ids.indexOf(id) !== index).length) {
                return false
            };
            return true
        },
        message: props => `Ids duplicados`
    },
    duplicateIdsInParties: {
        validator: array => {
            const ids = array.map(item => {
                return item.organizationRef.id
            });
            if (ids.filter((id, index) => ids.indexOf(id) !== index).length) {
                return false
            };
            return true
        },
        message: props => `Ids duplicados`
    },
    buyerIsNotSupplier: {
        validator: function (organizationRef) {
            return organizationRef.identifier.id == this.parent().buyer.identifier.id && this.roles.includes('supplier') ? false : true
        },
        message: props => `Comprador no puede ser un proveedor`
    },
    moreThanOneSupplier: {
        validator: function (parties) {
            let suppliers = [];
            parties.forEach(party => {
                if (party.roles.includes('supplier')) {
                    suppliers.push(party.organizationRef);
                }
            });
            if (suppliers.length > 1) {
                if (!this.awards) {
                    return false;
                }
                let awardSuppliers = []
                this.awards.forEach(award => {
                    awardSuppliers = awardSuppliers.concat(award.suppliers);
                });
                for (supplier of suppliers) {
                    if (!awardSuppliers.some(awardSupplier => {
                        return awardSupplier.equals(supplier._id);
                    })) {
                        return false
                    };
                };
            };
            return true;
        },
        message: props => `Existe mas de un proveedor, pero no esta el bloque de awards, o no tiene un award asignado`
    },
    partiesWithRepeatRoles: {
        validator: function (parties) {
            const mainRoles = ['procuringEntity', 'buyer', 'payer'];
            let roles = [];
            for (party of parties) {
                party.roles.forEach(rol => {
                    if (mainRoles.includes(rol)) {
                        roles.push(rol)
                    };
                });
            };
            if (roles.filter((rol, index) => roles.indexOf(rol) !== index).length) {
                return false;
            }
            return true;
        },
        message: props => `Existen roles repetidos de procuringEntity, buyer o payer`
    },
    isEmpty: {
        validator: field => field == null || field.length > 0,
        message: props => `${props.value} esta vacío`
    },
    isOCIDValid: {
        validator: ocid => new RegExp(`^(${constants.OCID}).*[0-9a-zA-Z]$`, 'g').test(ocid),
        message: props => `OCID ${props.value} no cumple el estándar`
    },
    isURL: {
        validator: url => /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/.test(url),
        message: props => `URL inválida: ${props.value}`
    },
    isURI: {
        validator: uri => /\w+:(\/?\/?)[^\s]+/.test(uri),
        message: props => `URI inválida: ${props.value}`
    },
    checkParties: {
        validator: function (id) {
            const that = this;
            const release = that.parent().parent();
            let isIdValid = true;
            if (release.parties && release.parties.length) {
                const partiesIds = release.parties.map(party => {
                    return party.id
                });
                if (!partiesIds.includes(id)) {
                    isIdValid = false;
                }
            } else {
                isIdValid = false;
            }
            return isIdValid;
        },
        message: props => `${props.value} no está entre las partes`
    },
    isOrganizationIdValid: {
        validator: id => new RegExp(`^(${constants.SCHEME.join('-|')}-)([0-9]*$)`, 'g').test(id),
        message: props => `${props.value} no es una identificación válida. Debe comenzar con ${constants.SCHEME.join(', ')}`
    },
    isEmptyArray: {
        validator: array => array && !array.length == 0,
        message: props => `Array vacío`
    },
    isValidDateFormat: {
        validator: date => /^(?:[1-9]\d{3}-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1\d|2[0-8])|(?:0[13-9]|1[0-2])-(?:29|30)|(?:0[13578]|1[02])-31)|(?:[1-9]\d(?:0[48]|[2468][048]|[13579][26])|(?:[2468][048]|[13579][26])00)-02-29)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+|.{0})(?:Z|[+-][01]\d:[0-5]\d)$/.test(date),
        message: props => `Fecha inválida. Formato: https://standard.open-contracting.org/latest/es/schema/reference/?highlight=date%3f#date`
    },
    isDateLessEqualToday: {
        validator: date => dayjs(date).format() <= dayjs().format(),
        message: props => `Fecha inválida. Es mayor al día de hoy`
    },
    isDateGreaterEqualStartDate: {
        validator: function (date) { return dayjs(date).format() >= dayjs(this.startDate).format() },
        message: props => `Fecha inválida. Es menor a startDate`
    },
    clearCache: () => {
        cache.clearCache('totalParties');
        cache.clearCache('partiesName');
    }
}
