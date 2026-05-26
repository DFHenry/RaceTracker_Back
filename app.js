import "dotenv/config";
import express from "express";
import sessions from "express-session";
import { scryptSync } from "crypto";
import path from "path";
import {MongoClient, ObjectId} from "mongodb";
import mongoose from "mongoose";
import { SerialPort } from "serialport";
import http from "http";
import {Server as SocketIOServer} from 'socket.io';

var rfid1 = new SerialPort(
{
    path: "COM5",
    baudRate: 9600
});

var fullMessage = "";
var newRFID = "";

//import mongodb collections
import userDb from "./db.js";
import vehicleDb from "./db.js";
import maintenanceDb from "./db.js";
import raceDb from "./db.js";

//express setup
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

const port = process.env.PORT || "8888";

const __dirname = import.meta.dirname;

//ejs setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

//use the public directory (for CSS, Images, Etc.)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({extended:true}));

//use JSON data
app.use(express.json());

io.on = ("connection", function(data)
{
    console.log("client connected");
});

//rfid Reader code
rfid1.on("data", async function(data)
{
    if(data != "" && data != null && data != undefined)
    {
        fullMessage += data;
        await delay(50);

        let sendMessage = fullMessage.trim();

        if(sendMessage != "")
        {
            newRFID = sendMessage;
            fullMessage = "";
            sendMessage = "";
        }
    }
});

//  +++ API INFO +++

//get api data from MongoDB
app.get("/api/sendApi", async (req, res) => 
{
    let users = await userDb.getUsers();
});

//  +++ LOGIN +++

//use sessions for a user session
app.use(
    sessions({
        secret: process.env.SESSIONSECRET,
        name: "",
        saveUninitialized: false,
        resave: false,
        cookie: {}
    })
);

//  +++ PAGE ROUTES +++

//index page, also the login page
app.get("/", (req, res) =>
{
    res.render("index");
});

//form for submitting login information
app.post("/login/submit", async (req, res) =>
{
    let auth = await userDb.authenticateUser(req.body.username, req.body.password);
    if(auth)
    {
        req.session.loggedIn = true;
        req.session.user = req.body.username;
        res.redirect("/dashboard");
    }
    else
    {
        res.render("index");
    }
});

//fomr for logging out
app.get("/login/logout", (req, res) =>
{
    req.session.destroy();
    res.redirect("/");
})

//form to create a new user
app.post("/login/newUser", async (req, res) =>
{
    let newUser = 
    {
        username: req.body.username,
        password: req.body.password
    };

    await userDb.addUser(newUser);
});

//load dashboard after logging in
app.get("/dashboard", async (req, res) => 
{
    const vehicles = await vehicleDb.getAllVehicles();

    res.render("dashboard", 
    {
        vehicles: vehicles
    });
});

app.get("/raceManagement", (req, res) =>
{
    res.render("race");
});

//  +++ VEHICLE CRUD FUNCITONS +++

//view details of one vehicle
app.get("/viewVehicle", async (req, res) => 
{
    let vehicleToView = await vehicleDb.getOneVehicle(req.query.vehicleId);
    let maintenanceLogView = await maintenanceDb.getAllLogs(req.query.vehicleNumber);

    res.render("viewVehicle", {vehicle: vehicleToView, logs: maintenanceLogView});
});

//update details of selected vehilce
app.post("/viewVehicle/updateVehicle/Submit", async (req, res) =>
{
    let filterId = {_id: new ObjectId(String(req.body.vehicleId)) };

    let vehicleToUpdate =
    {
        vehicleNumber: req.body.vehicleNumber,
        tagHex: req.body.tagHex,
        status: req.body.status
    }

    await vehicleDb.editVehicle(filterId, vehicleToUpdate);

    res.redirect("/dashboard");
});

//add maintenance log and update vehicle status
app.post("/viewVehicle/maintenance/submit", async (req, res) =>
{
    let newLog =
    {
        vehicleId: req.body.vehicleId,
        vehicleNumber: req.body.vehicleNumber,
        description: req.body.description,
        dateStarted: req.body.dateStarted,
        dateFinished: req.body.dateFinished,
        repairedBy: req.body.repairedBy,
        status: req.body.status
    };
    
    await maintenanceDb.addMaintenanceLog(newLog);

    let idFilter = {_id: new ObjectId(String(req.body.vehicleId)) };

    let vehicleToEdit = await vehicleDb.getOneVehicle(req.body.vehicleId); 

    vehicleToEdit.status = req.body.status;

    await vehicleDb.editVehicle(idFilter, vehicleToEdit);

    res.redirect("/dashboard");
});

//delete vehicle from DB
app.post("/viewVehicle/deleteVehicle/submit", async (req, res) =>
{
    await vehicleDb.deleteVehicle(req.body.vehicleId);

    await maintenanceDb.deleteLogs(req.body.vehicleNumber);

    res.redirect("/dashboard");
});

//load vehicle registry
app.get("/registerVehicle", (req, res) =>
{
    const hexCode = newRFID;

    res.render("registerVehicle",
        {
            newHex: hexCode
        }
    );
});

//add vehicle to registry
app.post("/registerVehicle/submit", async (req, res) =>
{
    let newVehicle = 
    {
        vehicleNumber: req.body.vehicleNumber,
        tagHex: newRFID,
        status: req.body.status
    };

    await vehicleDb.addVehicle(newVehicle)

    res.redirect("/dashboard");
});

//  +++ RACE MANAGEMENT FUNCTIONS +++

//add racer
// app.post("/raceManagement/addRacer/submit")
// {
    
// }

function delay(milliseconds)
{
    return new Promise(resolve =>
    {
        setTimeout(resolve, milliseconds);
    });
}

server.listen(port, () =>
{
    console.log("socket port is listening");
})

app.listen(port, () => 
{
    console.log(`Listening on http://localhost:${port}`);
});