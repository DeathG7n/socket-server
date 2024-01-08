const express = require('express')
const axios = require('axios')
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');
const app = express()
const http = require('http')
const { Server} = require('socket.io')
const cors = require('cors')
const WebSocket = require('ws');
const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const connection = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=36807');
const ta = require('ta.js')
const api = new DerivAPIBasic({ connection })

app.use(cors())

const server = http.createServer(app)
const firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const io = new Server(server,{
    cors:{
        origin: "*" 
    }
})

const assets = [
    {
        name: "Volatility 10(1s) Index",
        symbol: "1HZ10V"
    },
    {
        name: "Volatility 10 Index",
        symbol: "R_10"
    },
    {
        name: "Volatility 25(1s) Index",
        symbol: "1HZ25V"
    },
    {
        name: "Volatility 25 Index",
        symbol: "R_25"
    },
    {
        name: "Volatility 50(1s) Index",
        symbol: "1HZ50V"
    },
    {
        name: "Volatility 50 Index",
        symbol: "R_50"
    },
    {
        name: "Volatility 75(1s) Index",
        symbol: "1HZ75V"
    },
    {
        name: "Volatility 75 Index",
        symbol: "R_75"
    },
    {
        name: "Volatility 100(1s) Index",
        symbol: "1HZ100V"
    },
    {
        name: "Volatility 100 Index",
        symbol: "R_100"
    },
    {
        name: "Volatility 250(1s) Index",
        symbol: "1HZ250V"
    },
    {
        name: "Step Index",
        symbol: "STPRNG"
    },
    {
        name: "Drift Switch Index 10",
        symbol: "DSI10"
    },
    {
        name: "Drift Switch Index 20",
        symbol: "DSI20"
    },
    {
        name: "Drift Switch Index 30",
        symbol: "DSI30"
    },
]

let alert = []
function sendPushNotification(message){
    admin.messaging().send(message)
    .then((response) => {
        console.log('Successfully sent message: ', response);
    }).catch((error) => {
        console.log('Error sending message: ', error);
    });
}
let token

io.on("connection", (socket) =>{
    socket.on("token", (data)=>{
        token = data
    })
    setInterval(()=>{
        assets.forEach((asset)=>{ 
            getTicksHistory(asset) 
        })
        if(alert.length !== 0){
            io.emit("alert", alert)
        } 
        alert = []
        console.log(alert)
    }, 120000)
    console.log(`Connection Established by ${socket.id}`)
}) 


server.listen(3001,()=>{
    console.log("Server is running")
})

function getTimeFrame(count, time){
    if(time == "mins"){
      return count * 60
    }
    if(time == "hrs"){
      return count * 3600
    }
}
  
function getTicksRequest(symbol, count, timeframe){
    const ticks_history_request = {
      ticks_history: symbol,
      count: count,
      end: 'latest',
      style: 'candles',
      granularity: timeframe,
    };
    return ticks_history_request
}

  
const getTicksHistory = async (asset) => {
    try{
      const periodH1_50 = getTicksRequest(asset?.symbol, 50 , getTimeFrame(1, "hrs"))
      const periodM5_50 = getTicksRequest(asset?.symbol, 50 , getTimeFrame(5, "mins"))
      const periodH1_21 = getTicksRequest(asset?.symbol, 21 , getTimeFrame(1, "hrs"))
      const periodM5_21 = getTicksRequest(asset?.symbol, 21 , getTimeFrame(5, "mins"))
  
      const candlesH1_50 = await api.ticksHistory(periodH1_50);
      const candlesH1_21 = await api.ticksHistory(periodH1_21);
      const candlesM5_50 = await api.ticksHistory(periodM5_50);
      const candlesM5_21 = await api.ticksHistory(periodM5_21);
  
      const closePricesH1_50 = candlesH1_50?.candles?.map(i => {return i?.close})
      const closePricesM5_50 = candlesM5_50?.candles?.map(i => {return i?.close})
      const closePricesH1_21 = candlesH1_21?.candles?.map(i => {return i?.close})
      const closePricesM5_21 = candlesM5_21?.candles?.map(i => {return i?.close})
  
      const openPricesM5_21 = candlesM5_21?.candles?.map(i => {return i?.open})
      const lowPricesM5_21 = candlesM5_21?.candles?.map(i => {return i?.low})
      const highPricesM5_21 = candlesM5_21?.candles?.map(i => {return i?.high})
  
      const higher50ema = ta.ema(closePricesH1_50, closePricesH1_50?.length)
      const higher21ema = ta.ema(closePricesH1_21, closePricesH1_21?.length)
      const lower50ema = ta.ema(closePricesM5_50, closePricesM5_50?.length)
      const lower21ema = ta.ema(closePricesM5_21, closePricesM5_21?.length)
  
      const currrentPrice = closePricesM5_21[20]
  
      const higherTrend = higher21ema > higher50ema ? true : false
      const lowerTrend = lower21ema > lower50ema ? true : false
  
      function crossover(){
        return highPricesM5_21[19] > lower50ema &&  lowPricesM5_21[19] < lower50ema
      }
      function bearish(candle){
        return openPricesM5_21[candle] > closePricesM5_21[candle]
      }
      function bullish(candle){
        return closePricesM5_21[candle] > openPricesM5_21[candle]
      }

      if(higherTrend == true && crossover() && bullish(19)){
        alert.push(asset?.name)
        const message  = {
            token:token,
            notification:{
              "body":`${asset?.name} is continuing its Uptrend`,
              "title":"Trading Alert"
            }
        }
        sendPushNotification(message)
      }
      if(higherTrend == false && crossover() && bearish(19)){
        alert.push(asset?.name)
        const message  = {
            token:token,
            notification:{
              "body":`${asset?.name} is continuing its Downtrend`,
              "title":"Trading Alert"
            }
        }
        sendPushNotification(message)
      }
    } catch (error){
      console.log(error) 
    }
};


