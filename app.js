import "dotenv/config";
import express from "express";
import sessions from "express-session";
import { scryptSync } from "crypto";
import path from "path";
import {MongoClient, ObjectId} from "mongodb";
import mongoose from "mongoose";

//import mongodb collections
import userDb from "./db.js";

const app = express();
const port = process.env.PORT || "8888";

const __dirname = import.meta.dirname;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({extended:true}));
app.use(express.json());

//  +++ API INFO +++

app.get("/api/sendApi", async (req, res) => 
{
    let users = await userDb.getUsers();
});

//  +++ LOGIN +++

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


app.get("/", (req, res) =>
{
    res.render("index");
});

app.post("/login/submit", async (req, res) =>
{
    let auth = await userDb.authenticateUser(req.body.username, req.body.password);
    console.log(auth);
    if(auth)
    {
        req.session.loggedIn = true;
        req.session.user = req.body.username;
        console.log("Login Successful");
        res.redirect("/dashboard");
    }
    else
    {
        res.render("index");
    }
});

app.post("/login/newUser", async (req, res) =>
{
    let newUser = 
    {
        username: req.body.username,
        password: req.body.password
    };

    await userDb.addUser(newUser);
});

app.get("/dashboard", async (req, res) => 
{
    res.render("/dashboard");
});

app.listen(port, () => 
{
    console.log(`Listening on http://localhost:${port}`);
});