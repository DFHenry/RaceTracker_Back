import mongoose from "mongoose";
import {MongoClient, ObjectId} from "mongodb";
import { scryptSync } from "crypto";

//get uri from .env file
const dbUrl = `mongodb+srv://${process.env.DBUSER}:${process.env.DBPWD}@${process.env.DBHOST}/${process.env.DB_NAME}`;

//get users from collection
const userDb = new MongoClient(dbUrl).db("users");

const UserSchema = new mongoose.Schema(
{
    username: String,
    password: String
});

const User = mongoose.model("User", UserSchema);

//connect to the db
await mongoose.connect(dbUrl);

async function authenticateUser(username, password)
{
    let key = scryptSync(password, process.env.SALT, 64);
    console.log(key.toString("base64"));
    let result = await User.findOne(
    {
        user: username,
        password: key.toString("base64")
    });
    return (result) ? true : false;
}

async function getUsers()
{
    return await User.find({});    
}

async function addUser(newUser) 
{

    let key = scryptSync(newUser.password, process.env.SALT, 64);
    let userToAdd = new User(
    {
        username: newUser.username,
        password: key.toString("base64")
    });
    console.log(userToAdd.username);    
    let status = await User.insertOne(userToAdd);
}

export default
{
    authenticateUser,
    getUsers,
    addUser
}