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
import cors from "cors";

//RFID Reader !!! Change the RFIDPORT variable in the .env to the name of whichever port your Arduino board is plugged into
var rfid1 = new SerialPort(
{
    path: process.env.RFIDPORT,
    baudRate: 9600
});

//global variables for RFID reader
var fullMessage = "";
var newRFID = "";

//global object for racer creation
let Racer =
{
    rName: String,
    rEmail: String,
    rVehicle: Number,
    vehicleRFID: String
};

//global object for race creatoin
let Race =
{
    raceState: String,
    racers: [Racer],
    noOfLaps: Number
};

//websocket specific global variables
let raceIsRunning = false;

//import mongodb collections
import userDb from "./db.js";
import vehicleDb from "./db.js";
import maintenanceDb from "./db.js";
import raceDb from "./db.js";
import raceRecordDb from "./db.js";
import lapHistoryDb from "./db.js";
import { settings } from "node:cluster";
import db from "./db.js";

//server setup
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({server});

//websocket connection and methods
wss.on("connection", (ws, req) =>
{
    //server receives message from a page
    ws.on("message", (data) =>
    {
        //parse data into an array of strings
        let temp = `${data}`;
        let dataArray = temp.split(",");

        //call addRacer function if the dataArray[0] string is "registration"
        if(dataArray[0] == "registration")
        {
            //let curPage = dataArray[0];
            addRacer(dataArray);
        }

        //call runTheRace function if dataArray[0] string is "startCountdown"
        else if(dataArray[0] == "startCountdown")
        {
            runTheRace();
        }

        //call runTheRace function if dataArray[0] string is "findRFID"
        else if(dataArray[0] == "findRFID")
        {
            sendRFID(dataArray);
        }

        //call runTheRace function if dataArray[0] string is "startCountdown"
        else if(dataArray[0] == "checkRFID")
        {
            checkRFID(dataArray);
        }

        //call runTheRace function if dataArray[0] string is "startCountdown"
        else if(dataArray[0] == "addNewLap")
        {
            addNewLap(dataArray);
        }

        //sends the appropriate data though the websocket for the raceView page to process
        async function sendRFID(data)
        {
            let sendRFID = "checkRFID," + newRFID + ",";
            ws.send(sendRFID);
            dataArray.length = 0;
        }

        //add a racer to the race information on the db and send it back to the page via websocket message
        async function addRacer(newRacer)
        {
            //define variables for the vehicle number being assigned to a racer and its RFID Hex Code
            let assignedVehicle = 0;
            let assignedRFID = "";

            //get the vehicles from the array
            let vehicles = await vehicleDb.getAllVehicles();

            //get the current race data
            let newRace = await raceDb.getRaceData();

            //loop through all vehicles
            for(let i = 0; 0 < vehicles.length; i++)
            {
                //if a vehicle is idle, assign its number and hex code then break the loop
                if(vehicles[i].status == 'idle')
                {
                    assignedVehicle = vehicles[i].vehicleNumber;
                    assignedRFID = vehicles[i].tagHex;
                    break;
                }
            }

            //create a new racer object to add do the race
            let racerToAdd = Object.create(Racer);

            racerToAdd.rName = newRacer[1];
            racerToAdd.rEmail = newRacer[2];
            racerToAdd.rVehicle = assignedVehicle;
            racerToAdd.vehicleRFID = assignedRFID;

            //add the racer to the newRace array
            newRace.racers.push({racerName: racerToAdd.rName, racerEmail: racerToAdd.rEmail, vehicleNumber: racerToAdd.rVehicle, vehicleRFID: racerToAdd.vehicleRFID});

            //get the id for the race
            let idFilter = {_id: new ObjectId(String(newRace._id)) };

            //add the racer to the current race and update the DB
            await raceDb.addRacer(idFilter, newRace);

            //send a message to the raceReg page with data to add to the registered racers
            ws.send("<td>" + racerToAdd.rName + "</td><td>" + racerToAdd.rEmail + "</td><td>" + racerToAdd.rVehicle + "</td><td>" + racerToAdd.vehicleRFID + "</td>");

            //clear the data array
            dataArray.length = 0;
        }

        //check if newRFID has a hex code in it
        async function checkRFID(checkData)
        {
            //do nothing if newRFID is an empty string
            if(newRFID == "")
            {
                // console.log("no tag detected");
            }
            //otherwise, being checking the RFID
            else
            {
                //define arrays for minutes, seconds and count send by the viewRace page
                let minutesLog = checkData[1];
                let secondsLog = checkData[2];
                let dSecondsLog = checkData[3];

                //get the current race data
                let currentRace = await raceDb.getRaceData();

                //send the data back to the viewRace page with the appropriate data for adding a new lap
                await ws.send("detectedRFID," + newRFID + "," + minutesLog + "," + secondsLog + "," + dSecondsLog + ",");

                //clear the rfid and dataArray
                newRFID = "";
                dataArray.length = 0;
            }
        }

        //add a new lap to the database
        async function addNewLap(dataArray)
        {
            //get the current race data from the db
            let raceData = await raceDb.getRaceData();

            //get the id of the race data and the lap number
            let filterId = {_id: new ObjectId(String(raceData._id))}
            let lapNo = parseInt(dataArray[3]);

            //create a new lap object
            let newLap = 
            {
                lapTime: dataArray[1],
                lapRacer: dataArray[2],
                lapNumber: lapNo,
                polePosition: dataArray[4]
            };

            //send and update the db with the new lap data
            await raceDb.updateRaceData(filterId, newLap);
        }

        //start the race
        async function runTheRace() 
        {
            //if the race is running, tell the db that a race is runing
            if(raceIsRunning == false)
            {
                //get the current race data
                let curRace = await raceDb.getRaceData();

                //get the id of the current race data
                let filterId = {_id: new ObjectId(String(curRace._id)) };

                //create a raceUpdate with updated data
                let raceUpdate = 
                {
                    raceState: "running",
                    racers: curRace.racers,
                    noOfLaps: curRace.noOfLaps,
                    laps: curRace.laps
                };

                //update the race data with the new data
                await raceDb.runRace(filterId, raceUpdate);

                runTheRace = true;
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
app.use(express.urlencoded({extended:true}))

//cors for api use
app.use(cors({ origin: '*' }));

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
            fullMessage = "";
            sendMessage = "";
        }
    }
});

//  +++ API INFO +++

//get the current race data from MongoDB
app.get("/api/sendApi/raceData", async (req, res) => 
{
    let raceData = await raceDb.getRaceData();
    res.json(raceData);
});

//get the latest race history from MongoDB
app.get("/api/sendApi/raceHistory", async (req, res) =>
{
    let raceHistory = await raceDb.getRaceHistory();
    res.json(raceHistory);
})

//  +++ LOGIN +++

//use sessions for a user session
app.use(
    sessions({
        secret: process.env.SESSIONSECRET,
        name: "",
        saveUninitialized: false,
        resave: false,
        cookie: 
        {
            maxAge: 1000 * 60 * 60 * 16 //16 hours in milliseconds
        }
    })
);

//  +++ LOGIN FUNCTIONS +++

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

    res.redirect("/");
});

//  +++ DASHBOARD METHODS +++

//load dashboard after logging in
app.get("/dashboard", async (req, res) => 
{
    if(req.session.loggedIn)
    {
        const vehicles = await vehicleDb.getAllVehicles();

        //get race data, and if it does not exist, run initilization method
        let race = await raceDb.getRaceData();

        if(race == null || race == undefined)
        {
            await raceDb.initializeRaceData();
        }
        
        //get lap history, and if it does not exist, run initilization method
        let curDate = new Date();
        let historyReset = false;

        var lapHistory = await lapHistoryDb.getLapHistory();

        if(lapHistory == null || lapHistory == undefined || lapHistory.length == 0)
        {

            await lapHistoryDb.initializeLapHistory();
            lapHistory = await lapHistoryDb.getLapHistory();
        }

        //alter lap history for current day, month, and/or year
        for(let i = 0; i < lapHistory.length; i++)
        {
            //alter today's lap history
            if(lapHistory[i].periodString == "daily")
            {
                //alter daily lap history for todays date
                if(lapHistory[i].periodDate != curDate.getDate())
                {
                    let idFilter = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    let newDailyLog =
                    {
                        periodType: 3,
                        periodString: 'daily',
                        periodDate: curDate.getDate().toString(),
                        recordArray: []
                    }

                    await lapHistoryDb.alterLapHistory(idFilter, newDailyLog);
                    historyReset = true;
                }
                else
                {
                    // console.log("Daily Log is current.")
                }
            }

            //alter this month's lap history
            if(lapHistory[i].periodString == "monthly")
            {
                const month = ["January","February","March","April","May","June","July","August","September","October","November","December"];

                //alter daily lap history for todays date
                if(lapHistory[i].periodDate != month[curDate.getMonth()])
                {
                    let idFilter = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    let newMonthlyLog =
                    {
                        periodType: 2,
                        periodString: 'monthly',
                        periodDate: month[curDate.getMonth()],
                        recordArray: []
                    }

                    await lapHistoryDb.alterLapHistory(idFilter, newMonthlyLog);
                    historyReset = true;
                }
                else
                {
                    // console.log("Monthly Log is current.")
                }
            }
            
            //alter this year's lap history
            if(lapHistory[i].periodString == "annual")
            {

                //alter daily lap history for todays date
                if(lapHistory[i].periodDate != curDate.getFullYear())
                {
                    let idFilter = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    let newAnnualLog =
                    {
                        periodType: 1,
                        periodString: 'annual',
                        periodDate: month[curDate.getFullYear()],
                        recordArray: []
                    }

                    await lapHistoryDb.alterLapHistory(idFilter, newMonthlyLog);
                    historyReset = true;
                }
                else
                {
                    // console.log("Annual Log is current.");
                }
            }

            if(historyReset == true)
            {
                lapHistory = await lapHistoryDb.getLapHistory();
            }
        }

        res.render("dashboard", 
        {
            vehicles: vehicles,
            lapHistory: lapHistory
        });
    }
    else
    {
        res.redirect("/login/logout");
    }
});

//start a new race from the dashboard
app.get("/raceRegistration", async (req, res) =>
{
    if(req.session.loggedIn)
    {
        var curRace = await raceDb.getRaceData();

        curRace.raceState = "registration";

        let idFilter = {_id: new ObjectId(String(curRace._id)) };

        await db.startRace(idFilter, curRace);

        res.render("raceReg");
    }
    else
    {
        res.redirect("/login/logout");
    }
});

//view lap histories of a particular type (global, annual, etc.)
app.post("/viewHistory/submit", async (req, res) => 
{
    if(req.session.loggedIn)
    {
        let historyView = await lapHistoryDb.getOneLapHistory(req.body.historyType);

        res.render("lapHistory", {history: historyView});
    }
    else
    {
        res.redirect("/login/logout");
    }    
});

//  +++ VEHICLE CRUD FUNCITONS +++

//view details of one vehicle
app.get("/viewVehicle", async (req, res) => 
{
    if(req.session.loggedIn)
    {
        newRFID = "";

        let vehicleToView = await vehicleDb.getOneVehicle(req.query.vehicleId);
        let maintenanceLogView = await maintenanceDb.getAllLogs(req.query.vehicleNumber);

        res.render("viewVehicle", {vehicle: vehicleToView, logs: maintenanceLogView});
    }
    else
    {
        res.redirect("/login/logout");
    }
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
    if(req.session.loggedIn)
    {
        newRFID = "";

        res.render("registerVehicle");
    }
    else
    {
        res.redirect("/login/logout");
    }
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
    if(req.session.loggedIn)
    {
        let curRace = await raceDb.getRaceData();

        let idFilter = {_id: new ObjectId(String(curRace._id)) };

        let newRace =
        {
            raceState: "starting",
            racers: curRace.racers,
            noOfLaps: parseInt(req.body.noOfLaps)
        };

        await raceDb.startRace(idFilter, newRace);

        const finalRace = await raceDb.getRaceData();

        res.render("raceView", 
        {
            race: finalRace
        });
    }
    else
    {
        res.redirect("/login/logout");
    }
});

//return to the dashboard from 
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

//stop a race while it's running
app.post("/stopRace/submit", async (req, res) => 
{
    //reset current race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "standby";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;
    curRace.laps.length = 0;

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

//finish a race currently being run
app.post("/finishRace/submit", async (req, res) =>
{
    if(req.session.loggedIn)
    {
        //update the current race's raceState
        var curRace = await raceDb.getRaceData();

        let idFilter = {_id: new ObjectId(String(curRace._id)) };

        let finalizeRace = 
        {
            raceState: "finishing",
            racers: curRace.racers,
            noOfLaps: curRace.noOfLaps,
            laps: curRace.laps
        };

        await raceDb.finishRace(idFilter, finalizeRace);

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

        //add record to the raceRecords collection and update lap histories
        await raceRecordDb.addFinalizedRaceData(addedRaceRecord);

        //get lap history from the DB
        let lapHistory = await lapHistoryDb.getLapHistory();

        //check lap records for daily, monthly, annual, and global best times
        for(let i = 0; i < addedRaceRecord.lapRecords.length; i++)
        {
            if(lapHistory[i] != undefined && lapHistory[i] != null)
            {
                if(lapHistory[i].periodString == "global")
                {
                    //object for filterId for updating the global lap records
                    let filterId = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    //array for new lap history
                    var lapArray = [];

                    //if the lapHistory[i].recordArray isn't empty...
                    if(lapHistory[i].recordArray.length > 0)
                    {
                        //loop tough the record Array
                        for(let y = 0; y < lapHistory[i].recordArray.length; y++)
                        {
                            //add the lapHistory to the lapArray
                            lapArray.push(lapHistory[i].recordArray[y]);
                        }
                    }

                    //loop through the addedLapHistory.lapRecords array and add the laps to the lapArray
                    for(let y = 0; y < addedRaceRecord.lapRecords.length; y++)
                    {
                        lapArray.push(addedRaceRecord.lapRecords[y]);
                    }

                    //sort the array
                    lapArray.sort();

                    //shorten the array to 5 entries
                    lapArray.length = 5;          
                    
                    let newHistory =
                    {
                        periodType: lapHistory[i].periodType,
                        periodString: lapHistory[i].periodString,
                        periodDate: lapHistory[i].periodDate,
                        recordArray: lapArray
                    };

                    await lapHistoryDb.updateLapHistory(filterId, newHistory);
                }

                if(lapHistory[i].periodString == "annual")
                {
                    //object for filterId for updating the annual lap records
                    let filterId = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    //array for new lap history
                    var lapArray = [];

                    //if the lapHistory[i].recordArray isn't empty...
                    if(lapHistory[i].recordArray > 0)
                    {
                        //loop tough the record Array
                        for(let y = 0; y < lapHistory[i].recordArray.length; y++)
                        {
                            //add the lapHistory to the lapArray
                            lapArray.push(lapHistory[i].recordArray[y]);
                        }
                    }

                    //loop through the addedLapHistory.lapRecords array and add the laps to the lapArray
                    for(let y = 0; y < addedRaceRecord.lapRecords.length; y++)
                    {
                        lapArray.push(addedRaceRecord.lapRecords[y]);
                    }

                    //sort the array
                    lapArray.sort();

                    //shorten the array to 5 entries
                    lapArray.length = 5;
                    
                    let newHistory =
                    {
                        periodType: lapHistory[i].periodType,
                        periodString: lapHistory[i].periodString,
                        periodDate: lapHistory[i].periodDate,
                        recordArray: lapArray
                    };

                    await lapHistoryDb.updateLapHistory(filterId, newHistory)
                }

                if(lapHistory[i].periodString == "monthly")
                {
                    //object for filterId for updating the monthly lap records
                    let filterId = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    //array for new lap history
                    var lapArray = [];

                    //if the lapHistory[i].recordArray isn't empty...
                    if(lapHistory[i].recordArray > 0)
                    {
                        //loop tough the record Array
                        for(let y = 0; y < lapHistory[i].recordArray.length; y++)
                        {
                            //add the lapHistory to the lapArray
                            lapArray.push(lapHistory[i].recordArray[y]);
                        }
                    }

                    //loop through the addedLapHistory.lapRecords array and add the laps to the lapArray
                    for(let y = 0; y < addedRaceRecord.lapRecords.length; y++)
                    {
                        lapArray.push(addedRaceRecord.lapRecords[y]);
                    }

                    //sort the array
                    lapArray.sort();

                    //shorten the array to 5 entries
                    lapArray.length = 5;
                    
                    let newHistory =
                    {
                        periodType: lapHistory[i].periodType,
                        periodString: lapHistory[i].periodString,
                        periodDate: lapHistory[i].periodDate,
                        recordArray: lapArray
                    };

                    await lapHistoryDb.updateLapHistory(filterId, newHistory)
                }

                if(lapHistory[i].periodString == "daily")
                {
                    //object for filterId for updating the daily lap records
                    let filterId = {_id: new ObjectId(String(lapHistory[i]._id)) };

                    //array for new lap history
                    var lapArray = [];

                    //if the lapHistory[i].recordArray isn't empty...
                    if(lapHistory[i].recordArray > 0)
                    {
                        //loop tough the record Array
                        for(let y = 0; y < lapHistory[i].recordArray.length; y++)
                        {
                            //add the lapHistory to the lapArray
                            lapArray.push(lapHistory[i].recordArray[y]);
                        }
                    }

                    //loop through the addedLapHistory.lapRecords array and add the laps to the lapArray
                    for(let y = 0; y < addedRaceRecord.lapRecords.length; y++)
                    {
                        lapArray.push(addedRaceRecord.lapRecords[y]);
                    }

                    //sort the array
                    lapArray.sort();

                    //if lapArray is longer than 5, shorten it to 5
                    if(lapArray.length > 5)
                    {
                        lapArray.length = 5;
                    }
                    
                    let newHistory =
                    {
                        periodType: lapHistory[i].periodType,
                        periodString: lapHistory[i].periodString,
                        periodDate: lapHistory[i].periodDate,
                        recordArray: lapArray
                    };

                    await lapHistoryDb.updateLapHistory(filterId, newHistory)
                }
            }
        }

        //load raceFinish.ejs and pass data to it
        res.render("raceFinish",
        {
            raceRecord: newRaceRecord
        });
    }
    else
    {
        res.redirect("/login/logout");
    }
});

//delet a lap from the lap history
app.post("/lapHistory/deleteLap/submit", async (req, res) =>
{
    let recordNumber = req.body.recordNumber;

    let historyData = req.body._id;

    await lapHistoryDb.deleteOneLap(recordNumber, historyData);

    res.redirect("/dashboard");
});

//start a new race after one has just finished
app.post("/finishRace/newRace/submit", async (req, res) =>
{
    //reset race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "registration";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;
    curRace.laps.length = 0;

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

//return to the dashboard after a race has finished
app.post("/finishRace/dashboard/submit", async (req, res) =>
{
    //reset race data
    var curRace = await raceDb.getRaceData();

    curRace.raceState = "standby";
    curRace.racers.length = 0;
    curRace.noOfLaps = 1;
    curRace.laps.length = 0;

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

//redirrect to the dashboard from the lapHistory page
app.post("/lapHistory/dashboard/submit", async (req, res) =>
{
    res.redirect("/dashboard");
});

//delay function
function delay(milliseconds)
{
    return new Promise(resolve =>
    {
        setTimeout(resolve, milliseconds);
    });
}

//listen to the port the DB is running on
server.listen(port, () =>
{
    //console.log("port is listening on: " + port);
});