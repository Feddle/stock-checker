/*
*
*
*       Complete the API routing below
*
*
*/
//All the complexity comes from avoiding unnecessary writes and fetches
//Perhaps the handleOneStock should actually accepts and process two stocks(?)

'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb');
const axios = require('axios');

const CONNECTION_STRING = process.env.DB; //MongoClient.connect(CONNECTION_STRING, function(err, db) {});

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(function (req, res){  
      const like = req.query.like ? true : false;
      const s = Array.isArray(req.query.stock) ? req.query.stock : [req.query.stock];
      let stocks = s.map(a => {return a.toUpperCase()});
      let cookies = req.cookies.stock ? req.cookies.stock : [];
    
      let callback = (error, stocksToReturn, stocksToSave, cookie) => {          
        if(error) {res.status(400); res.send(error);}
        if(cookie) {res.cookie("stock", cookie.stockArray, cookie.options);}
        if(stocksToSave) saveToDb(stocksToSave);
        res.send(stocksToReturn);
      };
    
      if(stocks.length == 1) handleOneStock(stocks, like, cookies, callback);   
    
      if(stocks.length == 2) {        
        let stockData = [];
        let index = 0;
        let obj = [];
        
        let sendRequest = () => {          
          let cookie1 = stockData[0].cookie ? stockData[0].cookie.stockArray : null;
          let cookie2 = stockData[1].cookie ? stockData[1].cookie.stockArray : null;
          let cookieConcat = cookie1 && cookie2 ? cookie1.concat(cookie2) : (cookie1 ? cookie1 : (cookie2 ? cookie2 : null));
          
          for(let item of stockData) {            
            if(item.error) {res.status(400); res.send("Error occured"); return;}   
            if(cookieConcat) {res.cookie("stock", cookieConcat.stockArray, cookie1.options);}
            if(item.stocksToSave) saveToDb(item.stocksToSave);
            obj.push({stock: item.stocksToReturn.stockData.stock, price: item.stocksToReturn.stockData.price});
          }
          
          obj[0].rel_likes = stockData[0].stocksToReturn.stockData.likes - stockData[1].stocksToReturn.stockData.likes;
          obj[1].rel_likes = stockData[1].stocksToReturn.stockData.likes - stockData[0].stocksToReturn.stockData.likes;
          res.send({stockData: obj});
        };
        
        let cb = (error, stocksToReturn, stocksToSave, cookie) => {          
          ++index;
          let returnObj = {error, stocksToReturn, stocksToSave, cookie};
          stockData.push(returnObj);
          if(index == 2) sendRequest();
        };        
        handleOneStock([stocks[0]], like, cookies, cb);
        handleOneStock([stocks[1]], like, cookies, cb);
                
      }
       
    });
      
  
  
  function handleOneStock(stocks, like, cookies, callback) {   
    MongoClient.connect(CONNECTION_STRING, function(err, client) { 
      let stocksToSave = [];
      let returnObj = {error: null, cookie: null, stocksToSave: null};             
      client.db("glitch").collection("stock-checker").find({stock: {$in: stocks}}).toArray((err, result) => {
        if(err) {returnObj.error = err; console.log(err); return returnObj;}        

        let handleEnd = (stockToReturn) => {            
          let obj = {};
          obj.stockData = {stock: stockToReturn.stock, price: stockToReturn.price, updated_on: stockToReturn.updated_on, likes: stockToReturn.likes};            
          returnObj.stocksToReturn = obj;
          returnObj.stocksToSave = stocksToSave;
          client.close();            
          callback(returnObj.error, returnObj.stocksToReturn, returnObj.stocksToSave, returnObj.cookie);
        };

        if(result.length == 0) {            
          getStock(stocks[0]).then((newStock) => {
            newStock.likes = like ? 1 : 0;                          
            stocksToSave.push({stock: newStock.stock, data: {price: newStock.price, updated_on: newStock.updated_on, likes: newStock.likes}});              
            handleEnd(newStock);
          });            
        }
        else if(result.length == 1) {            
          checkForUpdate(result[0]).then((updatedStock) => {              
            if(updatedStock) {              
              if(like && !cookies.includes(updatedStock.stock)) {
                 ++updatedStock.likes;
                let cookieArray = cookies.length > 0 ? cookies : [];
                cookieArray.push(updatedStock.stock);
                returnObj.cookie = {stockArray: cookieArray, options: { expires: new Date("2077"), httpOnly: true }};
              } 

              stocksToSave.push({
                stock: updatedStock.stock,
                data: {
                  price: updatedStock.price, 
                  updated_on: updatedStock.updated_on, 
                  ...(like && {likes: updatedStock.likes})}  //Taken from stackoverflow/11704267 , if like flag is true add likes property with updated likes
              });
              handleEnd(updatedStock);
            }
            else {              
              if(like && !cookies.includes(result[0].stock)) {
                result[0].likes = ++result[0].likes;
                stocksToSave.push({stock: result[0].stock, data: {likes: result[0].likes}});
                let cookieArray = cookies.length > 0 ? cookies : [];
                cookieArray.push(result[0].stock);
                returnObj.cookie = {stockArray: cookieArray, options: { expires: new Date("2077"), httpOnly: true }};
              }
              handleEnd(result[0]);
            }            
          });                           
        }                              
      });
    });
  }
      
  
  
  //Saves the array of stocks ( [{stock: "name", data: {}}] ) to database
  async function saveToDb(stocksToSave) {      
    for(let stock of stocksToSave) {
      MongoClient.connect(CONNECTION_STRING, function(err, client) {          
        client.db("glitch").collection("stock-checker").updateOne({stock: stock.stock}, {$set: stock.data},{upsert: true}, (err, result) => {
          let msg;
          if(err) msg = err;
          msg = "Updated database entries"
          client.close();
          return msg;
        });
      });    
    }
  }
  
  
  
  //Checks and if needed updates given stock
  //returns the stock if update found, else returns false
  async function checkForUpdate(stock) {
    let oneDay = 90000000;            
    let currentDate = new Date();
    let result;
    let sinceUpdated = currentDate - new Date(stock.updated_on);
      
     //Needs to be updated
    if(sinceUpdated > oneDay) {      
      let newStock = await getStock(stock.stock);
      result = newStock;
      result.likes = stock.likes; 
      return result;                                         
    }
    else return false;                                         
  }
  
  
  //Gets updated stock data from alphavantage
  //returns that stock as {stock, price, updated_on}
  async function getStock(name) {       
    let url = "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=" + name +"&apikey=" + process.env.ALPHAVANTAGE_API_KEY;
    let obj = {};
    try {
      const response = await axios.get(url);       
      obj.stock = response.data["Global Quote"]["01. symbol"];
      obj.price = response.data["Global Quote"]["05. price"];
      obj.updated_on = new Date();       
      return obj;
    } catch (error) {
      console.log(error);
    }        
  }
    
};

