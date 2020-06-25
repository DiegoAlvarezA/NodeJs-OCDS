const express = require('express');
const router = express.Router();

const { isAuth, speedLimiter, upload } = require('../middleware');
const contractController = require('../controllers/contract');
const organizationController = require('../controllers/organization');

router.get('/release', contractController.getReleases);
router.get('/release/id/:id', contractController.getReleaseById);
router.get('/release/ocid/:ocid', contractController.getReleaseByOcid);

router.post('/upload-contracts', speedLimiter, isAuth, organizationController.userHasOrganization, upload.single('contract'), contractController.uploadContracts);

router.post('/save-release', speedLimiter, isAuth, organizationController.userHasOrganization, contractController.saveRelease);
router.post('/save-update', speedLimiter, isAuth, organizationController.userHasOrganization, contractController.userCanEditRelease, contractController.saveRelease);

router.get('/contracts', contractController.getContracts);

router.get('/users', contractController.getUsers);

router.post('/convert-xls', speedLimiter, isAuth, organizationController.userHasOrganization, upload.single('contract'), contractController.convertXlsxToJSON);

module.exports = router;