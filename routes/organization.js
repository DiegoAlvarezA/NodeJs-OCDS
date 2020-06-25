const express = require('express');
const router = express.Router();

const organizationController = require('../controllers/organization');
const { isAuth, speedLimiter } = require('../middleware');

router.get('/party', organizationController.getPartyInfo);
router.get('/party/:idname', organizationController.getPartyInfo);
router.get('/organization', organizationController.getOrganization);
router.get('/contractsByOrganization', organizationController.getContractsByOrganization);
router.post('/register-company', speedLimiter, isAuth, organizationController.registerOrganization);
router.put('/update-company', speedLimiter, isAuth, organizationController.updateOrganization);
router.put('/assign-company', speedLimiter, isAuth, organizationController.assignUserToOrganization);

module.exports = router;