/*
*
*
*       FILL IN EACH FUNCTIONAL TEST BELOW COMPLETELY
*       -----[Keep the tests in the same order!]-----
*       (if additional are added, keep them at the very end!)
*/

var chaiHttp = require('chai-http');
var chai = require('chai');
var assert = chai.assert;
var server = require('../server');
var MongoClient = require('mongodb');

const CONNECTION_STRING = process.env.DB; 

chai.use(chaiHttp);

suite('Functional Tests', function() {
    
    suite('GET /api/stock-prices => stockData object', function() {
      this.timeout(6000);
      
      suiteSetup(function(done) {
        MongoClient.connect(CONNECTION_STRING, function(err, client) {
          client.db("glitch").collection("stock-checker").insertMany([{stock: "GOOG", price: "1195.3100", likes: 0, updated_on: new Date()}, {stock: "MSFT", price: "115.6100", likes: 0, updated_on: new Date()}], (err, result) => {
           if(err) console.log(err);
           client.close();
            done();
          });
        });
      });
      
      suiteTeardown(function(done) {
        MongoClient.connect(CONNECTION_STRING, function(err, client) {
          client.db("glitch").collection("stock-checker").deleteMany({stock: {$in: ["GOOG", "MSFT"]}}, (err, result) => {
           if(err) console.log(err);
           client.close();
            done();
          });
        });        
      });      
      
      /*setup(function(done) {
        setTimeout(() => {}, 2000);
        done();
      });*/
      
      test('1 stock', function(done) {        
       chai.request(server)
        .get('/api/stock-prices')
        .query({stock: 'goog'})
        .end(function(err, res){
          assert.equal(res.status, 200);
          assert.property(res.body, "stockData");
          assert.equal(res.body.stockData.stock, "GOOG");
          assert.property(res.body.stockData, "price");
          assert.property(res.body.stockData, "likes");          
          done();
        });
      });
      
      test('1 stock with like', function(done) {
        chai.request(server)
        .get('/api/stock-prices')
        .query({stock: 'goog', like: true})
        .end(function(err, res){
          assert.equal(res.status, 200);
          assert.property(res.body, "stockData");
          assert.equal(res.body.stockData.stock, "GOOG");
          assert.property(res.body.stockData, "price");
          assert.equal(res.body.stockData.likes, 1);          
          done();
        });
      });
      
      test('1 stock with like again (ensure likes arent double counted)', function(done) {
        chai.request(server)
        .get('/api/stock-prices')
        .set("Cookie", "stock=['GOOG']")
        .query({stock: 'goog', like: true})
        .end(function(err, res){
          assert.equal(res.status, 200);
          assert.property(res.body, "stockData");
          assert.equal(res.body.stockData.stock, "GOOG");
          assert.property(res.body.stockData, "price");
          assert.equal(res.body.stockData.likes, 1);          
          done(); 
        });
      });
      
      test('2 stocks', function(done) {
        setTimeout(() => {}, 2000);
        chai.request(server)
        .get('/api/stock-prices')
        .query({stock: ["goog", "msft"]})
        .end(function(err, res){
          assert.equal(res.status, 200);
          assert.isArray(res.body.stockData);
          assert.equal(res.body.stockData[0].stock, "GOOG");
          assert.property(res.body.stockData[0], "price");
          assert.equal(res.body.stockData[0].rel_likes, 1);      
          assert.equal(res.body.stockData[1].stock, "MSFT");
          assert.property(res.body.stockData[1], "price");
          assert.equal(res.body.stockData[1].rel_likes, -1);
          done();
        });
      });
      
      test('2 stocks with like', function(done) {
        chai.request(server)
        .get('/api/stock-prices')
        .query({stock: ["goog", "msft"], like: true})
        .end(function(err, res){
          assert.equal(res.status, 200);
          assert.isArray(res.body.stockData);
          assert.equal(res.body.stockData[0].stock, "GOOG");
          assert.property(res.body.stockData[0], "price");
          assert.equal(res.body.stockData[0].rel_likes, 1);      
          assert.equal(res.body.stockData[1].stock, "MSFT");
          assert.property(res.body.stockData[1], "price");
          assert.equal(res.body.stockData[1].rel_likes, -1);        
          done();
        });
      });
      
    });

});
