import "dotenv/config";
import express from "express";
import sessions from "express-session";
import { scryptSync } from "crypto";
import path from "path";
import {MongoClient, ObjectId} from "mongodb";
import mongoose from "mongoose";
import { SerialPort } from "serialport";
import http from "http";
import { createServer } from "http";
import { WebSocketServer } from "ws";
// import { setTimeout } from "node:timers/promises";

//RFID Reader !!! May need to change path based on which port/OS you're using
var rfid1 = new SerialPort(
{
    path: "COM5",
    baudRate: 9600
});

//global variables for RFID reader
var fullMessage = "";
var newRFID = "";

//global variables for race creation
let Racer =
{
    rName: String,
    rEmail: String,
    rVehicle: Number
};

let Race =
{
    raceState: String,
    racers: [Racer],
    noOfLaps: Number
};

let newRace;

//import mongodb collections
import userDb from "./db.js";
import vehicleDb from "./db.js";
import maintenanceDb from "./db.js";
import raceDb from "./db.js";
import { settings } from "node:cluster";

//server setup
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({server});

//websocket connection and methods
wss.on("connection", (ws, req) =>
{
    console.log("client connected");

    //server receives message from AddRacer function from the RaceManagement page
    ws.on("message", (newRacer) =>
    {
        startRace();

        async function startRace()
        {
            //store info into a string, then split into an array
            let temp = `${newRacer}`;
            let racerArray = temp.split(",");
            let assignedVehicle = 0;
            
            var vehicles = await vehicleDb.getAllVehicles();

            //await setTimeout(1000);

            //if newrace is empty, make it a Race
            if(newRace == undefined || newRace == null)
            {
                newRace = Object.create(Race);
            }

            //loop through all vehicles
            for(let i = 0; 0 < vehicles.length; i++)
            {
                // console.log("ping: " + vehicles[i].vehicleNumber);

                if(vehicles[i].status == 'idle')
                {
                    assignedVehicle = vehicles[i].vehicleNumber;
                    console.log("Assigned Vehicle Number: " + assignedVehicle);
                    break;
                }
            }

            let racerToAdd = Object.create(Racer)

            racerToAdd.rName = racerArray[0];
            racerToAdd.rEmail = racerArray[1];
            racerToAdd.rVehicle = assignedVehicle;

            newRace.racers.push(racerToAdd);

            ws.send("<td>" + racerToAdd.rName + "</td><td>" + racerArray[1] + "</td><td>" + racerToAdd.rVehicle + "</td>");
        }
    });

    //when a client disconnects from the server
    ws.on("close", () => console.log("client disconnected"));
});

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

//rfid Reader code
rfid1.on("data", async function(data)
{
    if(data != "" && data != null && data != undefined)
    {
        fullMessage += data;
        await delay(500);

        let sendMessage = fullMessage.trim();

        if(sendMessage != "")
        {
            newRFID = sendMessage;
            console.log(sendMessage);
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

    let race = await raceDb.getRaceData();

    if(!race.length)
    {
        await raceDb.initializeRaceData();
    }

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

    await vehicleDb.addVehicle(newVehicle);

    res.redirect("/dashboard");
});

//  +++ RACE MANAGEMENT FUNCTIONS +++

//start new race
app.post("/raceManagement/startRace/submit", async (req, res) =>
{
    let newRace = 
    {
        raceState: req.body.raceState,
        racers: req.body.racers,
        noOfLaps: req.body.noOfLaps
    }

    await raceDb.startRace(newRace);
});

function delay(milliseconds)
{
    return new Promise(resolve =>
    {
        setTimeout(resolve, milliseconds);
    });
}

server.listen(port, () =>
{
    console.log("port is listening on: " + port);
})

// app.listen(port, () => 
// {
//     console.log(`Listening on http://localhost:${port}`);
// });