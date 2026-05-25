import "dotenv/config";
import express from "express";
import sessions from "express-session";
import { scryptSync } from "crypto";
import path from "path";
import {MongoClient, ObjectId} from "mongodb";
import mongoose from "mongoose";
import { SerialPort } from "serialport";
import http from "http";
import {Server} from 'socket.io';

var rfid1 = new SerialPort(
{
    path: "COM5",
    baudRate: 9600
});

var fullMessage = "";

//import mongodb collections
import userDb from "./db.js";
import vehicleDb from "./db.js";

//express setup
const app = express();
const port = process.env.PORT || "8888";

const __dirname = import.meta.dirname;

const io = new Server(port);

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
    console.log("node is listening");
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
            console.log(sendMessage);
            io.emit("data", sendMessage);
        }
        fullMessage = "";
        sendMessage = "";
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

//load vehicle registry
app.get("/registerVehicle", (req, res) =>
{
    res.render("registerVehicle");
});

//add vehicle to registry
app.post("/registerVehicle/submit", async (req, res) =>
{
    let newVehicle = 
    {
        vehicleNumber: req.body.vehicleNumber,
        tagHex: req.body.tagHex,
        status: req.body.status
    };

    await vehcileDB.addVehicle(newVehicle)

    res.redirect("/dashboard");
});

function delay(milliseconds)
{
    return new Promise(resolve =>
    {
        setTimeout(resolve, milliseconds);
    });
}

app.listen(port, () => 
{
    console.log(`Listening on http://localhost:${port}`);
});