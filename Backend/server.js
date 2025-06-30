const express = require('express');
const cors=require('cors');
const connectToMongo = require('./db/dbConnect');
const problemRouter=require('./routes/problemRoutes');
const authRouter=require('./routes/authRouter');
const userRouter=require('./routes/userRoute');
const userContestController=require('./routes/userContestRouter')
require('dotenv').config();
const app=express();
connectToMongo();
app.use(cors());
app.use(express.json());

app.use('/problems',problemRouter);
app.use('/auth',authRouter);
app.use('/user',userRouter,userContestController);
const port=process.env.PORT || 5000;
app.listen(port || 5000,()=>{
    console.log("Backend running on port "+port);
})