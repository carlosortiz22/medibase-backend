const express = require("express");
const cors = require("cors");
const { router: auth } = require("./auth");
const { router: clinica } = require("./clinica");
const { router: citas } = require("./citas");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("API MediBase funcionando"));
app.use("/api/auth", auth);
app.use("/api", clinica);
app.use("/api", citas);

module.exports = app;
