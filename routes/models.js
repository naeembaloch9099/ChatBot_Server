const express = require("express");
const router = express.Router();
const modelsController = require("../controllers/models");

router.get("/", modelsController.listModels);

module.exports = router;
