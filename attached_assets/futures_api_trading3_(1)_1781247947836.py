import datetime
import time
import concurrent.futures

from cryptography.hazmat.primitives.asymmetric import ed25519
import json
import requests


class ApiTradingClient:
    secret_key = None,
    api_key = None

    def __init__(self, secret_key: str, api_key: str):
        self.secret_key = secret_key
        self.api_key = api_key
        self.base_url = "https://coinswitch.co"
        #self.base_url = "https://cs-india-uat.coinswitch.co"  # UAT
        self.headers = {
            "Content-Type": "application/json"
        }

    def call_api(self, url: str, method: str, headers: dict = None, payload: dict = {}):
        '''
        make an API call on webserver and return response

        Args:
          url (str): The API url to be called
          method (str): The API method
          headers (dict): required headers for API call
          payload (dict): payload for API call

        Returns:
          json: The response of the request
        '''
        final_headers = self.headers.copy()
        if headers is not None:
            final_headers.update(headers)

        response = requests.request(method, url, headers=headers, json=payload, verify=False)
        print("STATUS CODE", response.status_code)
        if response.status_code == 429:
            print("rate limiting")
        # print(response.text)
        return response.json()

    def signatureMessage(self, method: str, url: str, payload: dict, epoch_time=""):
        '''
          Generate signature message to be signed for given request

          Args:
            url (str): The API url to be called
            method (str): The API method
            epoch_time (str): epochTime for the API call

          Returns:
            json: The signature message for corresponding API call
        '''
        # message = method + url + json.dumps(payload, separators=(',', ':'), sort_keys=True)
        message = method + url + epoch_time
        return message

    def get_signature_of_request(self, secret_key: str, request_string: str) -> str:
        '''
          Returns the signature of the request

          Args:
            secret_key (str): The secret key used to sign the request.
            request_string (str): The string representation of the request.

          Returns:
            str: The signature of the request.
        '''
        try:
            request_string = bytes(request_string, 'utf-8')
            secret_key_bytes = bytes.fromhex(secret_key)
            secret_key = ed25519.Ed25519PrivateKey.from_private_bytes(secret_key_bytes)
            signature_bytes = secret_key.sign(request_string)
            signature = signature_bytes.hex()
        except ValueError:
            return False
        return signature

    def make_request(self, method: str, endpoint: str, payload: dict = {}, params: dict = {}):
        '''
        Make the request to :
          a. generate signature message
          b. generate signature signed by secret key
          c. send an API call with the encoded URL

        Args:
            method (str): The method to call API
            endpoint (str): The request endpoint to make API call
            payload (dict): The payload to make API call for POST request
            params (dict): The params to make GET request

          Returns:
            dict: The response of the request.

        '''
        decoded_endpoint = endpoint
        if method == "GET" and len(params) != 0:
            endpoint += '?' + '&'.join([f"{key}={value}" for key, value in params.items()])
            print("endpoint:", endpoint)
            decoded_string = endpoint.replace('+', ' ')
            decoded_endpoint = requests.utils.unquote(decoded_string)
            print("decoded_endpoint:", decoded_endpoint)

        epoch_time = str(int(datetime.datetime.now().timestamp() * 1000))
        print(epoch_time)

        signature_msg = self.signatureMessage(method, decoded_endpoint, payload, epoch_time)
        print("Signature msg:", signature_msg)
        signature = self.get_signature_of_request(self.secret_key, signature_msg)
        if not signature:
            return {"message": "Please Enter Valid Keys"}
        print("Signature is: ", signature)
        headers = {
            "X-AUTH-SIGNATURE": signature,
            "X-AUTH-APIKEY": api_key,
            "X-AUTH-EPOCH": epoch_time,
            "X-REQUEST-ID": "canary-app-abhi"+epoch_time
        }
        print(headers)

        url = f"{self.base_url}{endpoint}"
        print(url)
        # print(payload)
        response = self.call_api(url, method, headers=headers, payload=payload)
        # print(response)
        return json.dumps(response, indent=4)

    def remove_trailing_zeros(self, dictionary):
        for key, value in dictionary.items():
            print(key, type(value))
            print(key, isinstance(value, (int, float)))
            if isinstance(value, (int, float)) and dictionary[key] == int(dictionary[key]):
                dictionary[key] = int(dictionary[key])
                # print(int(dictionary[key]), key)
        return dictionary

    def ping(self):
        return self.make_request("GET", "/trade/api/v2/ping")

    def validate_keys(self):
        return self.make_request("GET", "/trade/api/v2/validate/keys")

    # Rates

    def get_depth(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/order_book", params=params)

    def get_trades(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/trades", params=params)

    # Candles
    def futures_get_candlestick_data(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/klines", params=params)

    def futures_get_assets(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/instrument_info", params=params)

    # Orders
    def futures_create_order(self, payload: dict = {}):
        # payload = self.remove_trailing_zeros(payload)
        print(payload)
        return self.make_request("POST", "/trade/api/v2/futures/order", payload=payload)

    def futures_cancel_order(self, payload: dict = {}):
        return self.make_request("DELETE", "/trade/api/v2/futures/order", payload=payload)

    def futures_get_leverage(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/leverage", params=params)

    def futures_update_leverage(self, payload: dict = {}):
        return self.make_request("POST", "/trade/api/v2/futures/leverage", payload=payload)

    def futures_get_order_by_id(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/order", params=params)

    def futures_open_orders(self, payload: dict = {}):
        return self.make_request("POST", "/trade/api/v2/futures/orders/open", payload=payload)

    def futures_closed_orders(self, payload: dict = {}):
        return self.make_request("POST", "/trade/api/v2/futures/orders/closed", payload=payload)

    def futures_get_position(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/positions", params=params)

    def futures_get_transactions(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/transactions", params=params)

    def futures_add_margin(self, payload: dict = {}):
        return self.make_request("POST", "/trade/api/v2/futures/add_margin", payload=payload)

    def futures_cancel_all(self, payload: dict = {}):
        return self.make_request("POST", "/trade/api/v2/futures/cancel_all", payload=payload)

    def futures_wallet_balance(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/wallet_balance", params=params)

    def get_24h_all_pairs_data(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/all-pairs/ticker", params=params)

    def get_24h_coin_pair_data(self, params: dict = {}):
        return self.make_request("GET", "/trade/api/v2/futures/ticker", params=params)

# Algo user

secret_key="bac9b6061eb6654b61806c5c143b1bca16becd12e1f5ce5b77f45195d7d20590"
api_key="ae36c1944ca8a7f8e90a0d918f2ac73eba1923586891da554e5362215760333e"

api_trading_client = ApiTradingClient(secret_key, api_key)

# check connection
# print(api_trading_client.ping())

# validate keys
# print(api_trading_client.validate_keys())




params = {
    "order_id": "019386e4-7cc7-7637-b297-b48911be438c"
}
#print(api_trading_client.futures_get_order_by_id(params=params))

payload = {
    "exchange" : "EXCHANGE_2",
    "order_id" : "01936797-9551-78c6-8927-a5822bf14131"
}
# print(api_trading_client.futures_cancel_order(payload=payload))


payload = {
    "exchange" : "EXCHANGE_2",
    #"symbol" : "BTCUSDT"
}
#print(api_trading_client.futures_cancel_all(payload=payload))




payload = {
  "exchange": "EXCHANGE_2",
  "side": "BUY",
 "order_type": "MARKET",
  "symbol": "BTCUSDT",
   "quantity":0.001,
    "reduce_only":False
}
# print(api_trading_client.futures_create_order(payload=payload))


payload = {
  "exchange": "EXCHANGE_2",
  "side": "BUY",
  "order_type": "MARKET",
  "symbol": "BTCUSDT",
   "quantity": 0.02,
  "trigger_price": 3160,
  "reduce_only": False
}
# print(api_trading_client.futures_create_order(payload=payload))



payload = {
  "exchange": "EXCHANGE_2",
  "side": "BUY",
  "order_type": "LIMIT",
  "symbol": "BTCUSDT",
   "quantity": 2,
  "price": 97000,
  "reduce_only": False
}
#print(api_trading_client.futures_create_order(payload=payload))


payload = {
  "exchange": "EXCHANGE_2",
  "side": "SELL",
  "order_type": "LIMIT",
  "symbol": "BTCUSDT",
   "quantity": 0.002,
  #"price": 100000,
  "reduce_only": False
}
# print(api_trading_client.futures_create_order(payload=payload))




payload = {
  "exchange": "EXCHANGE_2",
  "side": "SELL",
  "order_type": "TAKE_PROFIT_MARKET",
  "symbol": "BTCUSDT",
   "quantity": 0,
  #"trigger_price": 200000,
  "reduce_only": True
}

#print(api_trading_client.futures_create_order(payload=payload))


payload = {
  "exchange": "EXCHANGE_2",
  "side": "SELL",
  "order_type": "STOP_MARKET",
  "symbol": "BTCUSDT",
   "quantity": 0,
  #"trigger_price": 99000,
 "reduce_only": True
}
#print(api_trading_client.futures_create_order(payload=payload))


payload = {
  "exchange": "EXCHANGE_2",
  "side": "SELL",
  "order_type": "LIMIT",
  "symbol": "BTCUSDT",
   "quantity": 0.002,
  "price": 120000,
  "reduce_only": True
}
#print(api_trading_client.futures_create_order(payload=payload))

payload = {
  "exchange": "EXCHANGE_2",
  "side": "BUY",
  "order_type": "MARKET",
  "symbol": "ADAUSDT",
   "quantity": 18,
  "price": 0.4294,
  "reduce_only": False
}
# print(api_trading_client.futures_create_order(payload=payload))


# Cancel Order
payload = {
    "exchange": "EXCHANGE_2",
 "order_id": "01936f4d-1827-7951-8ba9-6d43012a2ad1"
}
#print(api_trading_client.futures_cancel_order(payload=payload))


params = {
    "exchange": "EXCHANGE_2"
}
print(api_trading_client.futures_get_assets(params=params))


params = {
    "order_id": "019329f8-721f-7a16-8641-40dac99d6c01"
}
#print(api_trading_client.futures_get_order(params=params))

payload = {
    "symbol": "BTCUSDT",
    "exchange": "EXCHANGE_2",  # mandatory
    #"to_time": 1700561179,
    #"from_time": 1703153179,
     "limit": 20
}
#print(api_trading_client.futures_open_orders(payload=payload))



payload = {

    #"exchange": "EXCHANGE_2",  # mandatory
}
#print(api_trading_client.futures_open_orders(payload=payload))



payload = {
    # "symbol": "btc/usdt",
    "exchange": "exchange_2",
    #"to_time": 1700561179,
    #"from_time": 1703153179,
     "limit": 5
}
# print(api_trading_client.futures_closed_orders(payload=payload))


payload = {

    "exchange": "exchange_2",
}
# print(api_trading_client.futures_closed_orders(payload=payload))


payload = {
    "symbol": "BTCUSDT",
    "exchange": "EXCHANGE_2",
    "leverage": 100
}

#
# print(api_trading_client.futures_update_leverage(payload=payload))

# Get Leverage
params = {
    "exchange": "EXCHANGE_2",
    "symbol": "DOGEUSDT"

}
# print(api_trading_client.futures_get_leverage(params=params))


# Get Positions
params = {
    "exchange": "EXCHANGE_2"

}
# print(api_trading_client.futures_get_position(params=params))


# Get Transactions
params = {
    "exchange": "EXCHANGE_2"

}
# print(api_trading_client.futures_get_transactions(params=params))


# Add Margin
payload = {
    "exchange": "EXCHANGE_2",
    "symbol": "1000PEPEUSDT",
    "margin": 20
}
#print(api_trading_client.futures_add_margin(payload=payload))


# get depth
params = {
    "exchange": "EXCHANGE_2",
    "symbol": "BTCUSDT"
}
# print(api_trading_client.get_depth(params=params))

params = {
    "symbol": "BTCUSDT",
    "exchange": "EXCHANGE_2"
}
#print(api_trading_client.get_24h_coin_pair_data(params=params))

params = {
    #"end_time": "1862681600000",
    #"start_time": "1647388800000",
    "symbol": "BTCUSDT",
    "interval": "15",
    "exchange": "EXCHANGE_2",
    #"limit":0
}
# print(api_trading_client.futures_get_candlestick_data(params = params))


params = {
"end_time": "1862681600000",
    "start_time": "1647388800000",
    "exchange": "exchange_2",
    "symbol": "btcusdt"
}
# print(api_trading_client.get_trades(params=params))




# get ticker 24hr all pair data
params = {
    "exchange": "EXCHANGE_2"
}
#print(api_trading_client.get_24h_all_pairs_data(params=params))

params = {
    "symbol": "BTCUSDT",
    "exchange": "EXCHANGE_2"
}
#print(api_trading_client.get_24h_coin_pair_data(params=params))




params = {
    "exchange": "EXCHANGE_2"
}
# print(api_trading_client.futures_wallet_balance(params=params))



params = {
    "exchange": "EXCHANGE_2"
}
# print(api_trading_client.futures_get_assets(params=params))


