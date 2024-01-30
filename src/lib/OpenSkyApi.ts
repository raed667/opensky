('use strict');

import axios, { Axios, AxiosRequestConfig } from 'axios';
import { URLSearchParams } from 'iso-url';

import { stateVectorMapper } from '../mappers/StateVectorMapper';
import { Credentials } from '../types/Credentials';
import { Flight } from '../types/Flight';
import { StateVector } from '../types/StateVector';

import { flightMapper } from './../mappers/FlightMapper';
import { BoundingBox } from './BoundingBox';

type RequestType = 'GET_STATES' | 'GET_MY_STATES' | 'GET_FLIGHTS';

const axiosConfig: AxiosRequestConfig = {
  timeout: 5000,
  headers: { 'User-Agent': 'OpenSkyApi-TS/1.0' },
};

export class OpenSkyApi {
  private static HOST = 'opensky-network.org';
  private static API_ROOT = `https://${this.HOST}/api`;
  private static STATES_URI = `${this.API_ROOT}/states/all`;
  private static MY_STATES_URI = `${this.API_ROOT}/states/own`;
  private static FLIGHTS_URI = `${OpenSkyApi.API_ROOT}/flights/all`;
  private static FLIGHTS_BY_AIRCRAFT_URI = `${OpenSkyApi.API_ROOT}/flights/aircraft`;
  private static FLIGHTS_BY_ARRIVAL_URI = `${OpenSkyApi.API_ROOT}/flights/arrival`;
  private static FLIGHTS_BY_DEPARTURE_URI = `${OpenSkyApi.API_ROOT}/flights/departure`;

  private _axios: Axios;

  private authenticated = false;

  private lastRequestTime: Record<RequestType, number | null> = {
    GET_STATES: null,
    GET_MY_STATES: null,
    GET_FLIGHTS: null,
  };

  constructor(credentials?: Credentials) {
    if (credentials?.username && credentials?.password) {
      axiosConfig.auth = {
        username: credentials?.username,
        password: credentials?.password,
      };
      this.authenticated = true;
    }

    this._axios = axios.create(axiosConfig);
  }

  public getFlights(beginTime: number, endTime: number) {
    const nvps: Array<Record<string, string>> = [];

    nvps.push({ begin: String(beginTime) });
    nvps.push({ end: String(endTime) });

    return this.getOpenSkyFlights(OpenSkyApi.FLIGHTS_URI, nvps);
  }

  public getFlightsByArrivalAirport(
    airport: string,
    beginTime: number,
    endTime: number,
  ) {
    const nvps: Array<Record<string, string>> = [];

    nvps.push({ airport });
    nvps.push({ begin: String(beginTime) });
    nvps.push({ end: String(endTime) });

    return this.getOpenSkyFlights(OpenSkyApi.FLIGHTS_BY_ARRIVAL_URI, nvps);
  }

  public getFlightsByDepartureAirport(
    airport: string,
    beginTime: number,
    endTime: number,
  ) {
    const nvps: Array<Record<string, string>> = [];

    nvps.push({ airport });
    nvps.push({ begin: String(beginTime) });
    nvps.push({ end: String(endTime) });

    return this.getOpenSkyFlights(OpenSkyApi.FLIGHTS_BY_DEPARTURE_URI, nvps);
  }

  public getFlightsByAircraft(
    icao24: string,
    beginTime: number,
    endTime: number,
  ) {
    const nvps: Array<Record<string, string>> = [];

    nvps.push({ icao24 });
    nvps.push({ begin: String(beginTime) });
    nvps.push({ end: String(endTime) });

    return this.getOpenSkyFlights(OpenSkyApi.FLIGHTS_BY_AIRCRAFT_URI, nvps);
  }

  public getStates(
    time: number | null,
    icao24: string[] | null,
    bbox?: BoundingBox | null,
  ) {
    const nvps: Array<Record<string, string>> = [];

    if (time) {
      nvps.push({ time: String(time) });
    }

    icao24?.forEach((i) => {
      nvps.push({ icao24: i });
    });

    if (bbox) {
      nvps.push({ lamin: String(bbox.minLatitude) });
      nvps.push({ lamax: String(bbox.maxLatitude) });
      nvps.push({ lomin: String(bbox.minLongitude) });
      nvps.push({ lomax: String(bbox.maxLongitude) });
    }

    if (this.checkRateLimit('GET_STATES', 4900, 9900)) {
      return this.getOpenSkyStates(OpenSkyApi.STATES_URI, nvps);
    }
    return null;
  }

  public getMyStates(
    time: number | null,
    icao24: string[] | null,
    serials: number[],
  ) {
    if (!this.authenticated) {
      throw new Error("Anonymous access of 'myStates' not allowed");
    }

    const nvps: Array<Record<string, string>> = [];

    if (time) {
      nvps.push({ time: String(time) });
    }

    icao24?.forEach((i) => {
      nvps.push({ icao24: i });
    });

    serials?.forEach((s) => {
      nvps.push({ serials: String(s) });
    });

    if (this.checkRateLimit('GET_MY_STATES', 900, 0)) {
      return this.getOpenSkyStates(OpenSkyApi.MY_STATES_URI, nvps);
    }
    return null;
  }

  private async getOpenSkyStates(
    url: string,
    nvps: Array<Record<string, string>>,
  ): Promise<{
    time: number;
    states: StateVector[];
  }> {
    const params = new URLSearchParams();

    nvps.forEach((i) => {
      for (const [key, value] of Object.entries(i)) {
        params.append(key, value);
      }
    });

    const { data } = await this._axios.get<{ time: number; states: any[] }>(
      url,
      {
        params,
      },
    );

    const states = data?.states?.map((state) => stateVectorMapper(state)) || [];

    return {
      time: data.time,
      states,
    };
  }

  private async getOpenSkyFlights(
    url: string,
    nvps: Array<Record<string, string>>,
  ): Promise<Flight[]> {
    const params = new URLSearchParams();

    nvps.forEach((i) => {
      for (const [key, value] of Object.entries(i)) {
        params.append(key, value);
      }
    });

    const { data } = await this._axios.get<Flight[]>(url, {
      params,
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 404,
    });

    if (Array.isArray(data)) {
      return data.map((d) => flightMapper(d));
    }
    return new Array<Flight>();
  }

  private checkRateLimit(
    type: RequestType,
    timeDiffAuth: number,
    timeDiffNoAuth: number,
  ): boolean {
    const t = this.lastRequestTime[type];
    const now = Date.now();
    this.lastRequestTime[type] = now;

    return (
      t == null ||
      (this.authenticated && now - t > timeDiffAuth) ||
      (!this.authenticated && now - t > timeDiffNoAuth)
    );
  }
}

export { BoundingBox } from './BoundingBox';
