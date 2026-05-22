import mongoose, { mongo } from "mongoose";
import {MongoClient, ObjectId} from "mongodb";
import { scryptSync } from "crypto";

//get uri from .env file
const dbUrl = `mongodb+srv://${process.env.DBUSER}:${process.env.DBPWD}@${process.env.DBHOST}/${process.env.DB_NAME}`;

//  +++ USER ACCOUNT DATA +++

//get users from collection
const userDb = new MongoClient(dbUrl).db("users");
const vehicleDb = new MongoClient(dbUrl).db("vehicles");

//user schema
const UserSchema = new mongoose.Schema(
{
    username: String,
    password: String
});

//user object
const User = mongoose.model("User", UserSchema);

//  +++ VEHICLE REGISTRY DATA +++

//vehicle schema
const VechicleSchema = new mongoose.Schema(
{
    vehicleNumber: Number,
    tagHex: String,
    status: String
});

//vehicle object
const Vehicle = mongoose.model("Vehicle", VechicleSchema);

//connect to the db
await mongoose.connect(dbUrl);

//  +++ LOGIN METHODS +++

//authenticate username and password
async function authenticateUser(username, password)
{
    let key = scryptSync(password, process.env.SALT, 64);
    let result = await User.findOne(
    {
        username: username,
        password: key.toString("base64")
    });
    return (result) ? true : false;
}

//find all users
async function getUsers()
{
    return await User.find({});    
}

//add a user to the DB
async function addUser(newUser) 
{
    let key = scryptSync(newUser.password, process.env.SALT, 64);
    let userToAdd = new User(
    {
        username: newUser.username,
        password: key.toString("base64")
    });   
    let status = await User.insertOne(userToAdd);
}

// +++ VEHICLE REGISTRY METHODS

//get all vehicles
async function getAllVehicles()
{
    return await Vehicle.find({});
}

//add vehicle to registry
async function addVehicle(newVehicle)
{
    let vehicleToAdd = new Vehicle(
    {
        vehicleNumber: newVehicle.vehicleNumber,
        tagHex: newVehicle.tagHex,
        status: newVehicle.status
    });
    let result = await Vehicle.insertOne(vehicleToAdd);
}

//method exports
export default
{
    authenticateUser,
    getUsers,
    addUser,
    getAllVehicles,
    addVehicle
}