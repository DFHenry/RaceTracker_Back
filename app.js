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

//RFID Reader !!! Change the RFIDPORT variable in the .env to the name of whichever port your Arduino board is plugged into
var rfid1 = new SerialPort(
{
    path: process.env.RFIDPORT,
    baudRate: 9600
});

//global variables for RFID reader
var fullMessage = "";
var newRFID = "";
var curRFID = "";

//global variables for race creation
let Racer =
{
    rName: String,
    rEmail: String,
    rVehicle: Number,
    vehicleRFID: String
};

let Race =
{
    raceState: String,
    racers: [Racer],
    noOfLaps: Number
};

//import mongodb collections
import userDb from "./db.js";
import vehicleDb from "./db.js";
import maintenanceDb from "./db.js";
import raceDb from "./db.js";
import raceRecordDb from "./db.js";
import { settings } from "node:cluster";
import db from "./db.js";

//server setup
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({server});

//websocket connection and methods
wss.on("connection", (ws, req) =>
{
    console.log("client connected"); 

    //server receives message from a page
    ws.on("message", (data) =>
    {
        //parse data into an array of strings
        let temp = `${data}`;
        let dataArray = temp.split(",");

        //  based on dataArray[0], perform an async function

        //call addRacer function if the dataArray[0] string is "registration"
        if(dataArray[0] == "registration")
        {
            //let curPage = dataArray[0];
            addRacer(dataArray);
        }

        else if(dataArray[0] == "findRFID")
        {
            sendRFID(dataArray);
        }

        else if(dataArray[0] == "checkRFID")
        {
            checkRFID(dataArray);
        }

        async function sendRFID(data)
        {
            let sendRFID = "checkRFID," + newRFID + ",";
            ws.send(sendRFID);
            dataArray.length = 0;
        }

        //add a racer to the race information on the db and send it back to the page via websocket message
        async function addRacer(newRacer)
        {
            let assignedVehicle = 0;
            let assignedRFID = "";

            let vehicles = await vehicleDb.getAllVehicles();

            let newRace = await raceDb.getRaceData();

            console.log("newRace is: " + newRace);

            //loop through all vehicles
            for(let i = 0; 0 < vehicles.length; i++)
            {
                if(vehicles[i].status == 'idle')
                {
                    assignedVehicle = vehicles[i].vehicleNumber;
                    assignedRFID = vehicles[i].tagHex;
                    //console.log("Assigned Vehicle Hex: " + assignedRFID);
                    break;
                }
            }

            let racerToAdd = Object.create(Racer);

            racerToAdd.rName = newRacer[1];
            racerToAdd.rEmail = newRacer[2];
            racerToAdd.rVehicle = assignedVehicle;
            racerToAdd.vehicleRFID = assignedRFID;

            newRace.racers.push({racerName: racerToAdd.rName, racerEmail: racerToAdd.rEmail, vehicleNumber: racerToAdd.rVehicle, vehicleRFID: racerToAdd.vehicleRFID});

            let idFilter = {_id: new ObjectId(String(newRace._id)) };

            await raceDb.addRacer(idFilter, newRace);

            ws.send("<td>" + racerToAdd.rName + "</td><td>" + racerToAdd.rEmail + "</td><td>" + racerToAdd.rVehicle + "</td><td>" + racerToAdd.vehicleRFID + "</td>");
            dataArray.length = 0;
        }

        async function checkRFID(checkData)
        {
            if(newRFID == "")
            {
                // console.log("no tag detected");
            }
            else
            {
                console.log("tag detected: " + newRFID);

                let minutesLog = checkData[1];
                let secondsLog = checkData[2];
                let dSecondsLog = checkData[3];

                ws.send("detectedRFID," + newRFID + "," + minutesLog + "," + secondsLog + "," + dSecondsLog + ",");

                newRFID = "";
                dataArray.length = 0;
            }
        }
    });

    //when a client disconnects from the server
    ws.on("close", () => console.log("client disconnected"));
});

//set port and directory
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

//rfid Reader
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

//  +++ DASHBOARD METHODS +++

//load dashboard after logging in
app.get("/dashboard", async (req, res) => 
{
    const vehicles = await vehicleDb.getAllVehicles();

    let race = await raceDb.getRaceData();

    if(race == null || race == undefined)
    {
        await raceDb.initializeRaceData();
    }

    res.render("dashboard", 
    {
        vehicles: vehicles
    });
});

app.get("/raceRegistration", async (req, res) =>
{
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "registration";

    console.log(curRace.raceState);

    let idFilter = {_id: new ObjectId(String(curRace._id)) };

    await db.startRace(idFilter, curRace);

    res.render("raceReg");
});

//  +++ VEHICLE CRUD FUNCITONS +++

//view details of one vehicle
app.get("/viewVehicle", async (req, res) => 
{
    newRFID = "";

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
    newRFID = "";

    res.render("registerVehicle");
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
app.post("/raceRegistration/startRace/submit", async (req, res) =>
{
    let curRace = await raceDb.getRaceData();

    let idFilter = {_id: new ObjectId(String(curRace._id)) };

    let newRace =
    {
        raceState: "running",
        racers: curRace.racers,
        noOfLaps: parseInt(req.body.noOfLaps)
    };

    //console.log("new race: " + newRace);

    await raceDb.startRace(idFilter, newRace);

    const finalRace = await raceDb.getRaceData();

    //console.log("final race: " + finalRace);

    res.render("raceView", 
    {
        race: finalRace
    });
});

app.post("/raceRegistration/dashboard/submit", async (req, res) => 
{
    //reset current race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "standby";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;

    let idFilter = {_id: new ObjectId(String(curRace._id)) };

    await db.startRace(idFilter, curRace);

    //reset active vehicle data
    var vehicles = await vehicleDb.getAllVehicles();

    for(let i = 0; i < vehicles.length; i++)
    {
        if(vehicles[i].status == "active")
        {
            let vehicleId = {_id: new ObjectId(String(vehicles[i]._id)) };

            let vehicle = vehicles[i];

            vehicle.status = "idle";

            await vehicleDb.editVehicle(vehicleId, vehicle);
        }
    }

    res.redirect("/dashboard"); 
});

app.post("/stopRace/submit", async (req, res) => 
{
    //reset current race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "standby";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;

    let idFilter = {_id: new ObjectId(String(curRace._id)) };

    await db.startRace(idFilter, curRace);

    //reset active vehicle data
    var vehicles = await vehicleDb.getAllVehicles();

    for(let i = 0; i < vehicles.length; i++)
    {
        if(vehicles[i].status == "active")
        {
            let vehicleId = {_id: new ObjectId(String(vehicles[i]._id)) };

            let vehicle = vehicles[i];

            vehicle.status = "idle";

            await vehicleDb.editVehicle(vehicleId, vehicle);
        }
    }

    res.redirect("/dashboard"); 
});

app.post("/finishRace/submit", async (req, res) =>
{
    //finalized race data parsed into json
    const newRaceRecord = JSON.parse(req.body.finishValue);

    //create an object from the json data to add to the DB
    let addedRaceRecord = 
    {
        raceDateTime: newRaceRecord.raceDateTime,
        finaPositions: newRaceRecord.finalPositions,
        lapRecords:  newRaceRecord.lapRecords,
        noOfLaps: newRaceRecord.noOfLaps,
        racers: newRaceRecord.racers
    };

    //add record to the raceRecords collection
    await raceRecordDb.addFinalizedRaceData(addedRaceRecord);

    //load raceFinish.ejs and pass data to it
    res.render("raceFinish",
    {
        raceRecord: newRaceRecord
    });
});

app.post("/finishRace/newRace/submit", async (req, res) =>
{
    //reset race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "registration";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;

    let idFilter = {_id: new ObjectId(String(curRace._id)) };

    await db.startRace(idFilter, curRace);

    //reset active vehicle data
    var vehicles = await vehicleDb.getAllVehicles();

    for(let i = 0; i < vehicles.length; i++)
    {
        if(vehicles[i].status == "active")
        {
            let vehicleId = {_id: new ObjectId(String(vehicles[i]._id))}

            let vehicle = vehicles[i];

            vehicle.status = "idle";

            await vehicleDb.editVehicle(vehicleId, vehicle);
        }
    }
    res.render("raceReg");

});

app.post("/finishRace/dashboard/submit", async (req, res) =>
{
    //reset race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "standby";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;

    console.log(curRace.raceState);

    let idFilter = {_id: new ObjectId(String(curRace._id)) };

    await db.startRace(idFilter, curRace);

    //reset active vehicle data
    var vehicles = await vehicleDb.getAllVehicles();

    for(let i = 0; i < vehicles.length; i++)
    {
        if(vehicles[i].status == "active")
        {
            console.log("changing vehicle " + vehicles[i]._id);
            let vehicleId = {_id: new ObjectId(String(vehicles[i]._id)) };

            let vehicle = vehicles[i];

            vehicle.status = "idle";

            await vehicleDb.editVehicle(vehicleId, vehicle);
        }
    }

    res.redirect("/dashboard");
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