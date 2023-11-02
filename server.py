import IPython
import json
import psycopg2
from time import time
from pathlib import Path
from pprint import pformat
from dotenv import dotenv_values
from flask import Flask, url_for, render_template, request, redirect, session

app = Flask(__name__)
app.secret_key = b'_5#y2L"F4Qvsdsdufndsuifvbsivbvdubff/'

MAPBOX_TOKEN = 'pk.eyJ1IjoibG9sb3ZvbmhvIiwiYSI6ImNsb2QxdDczeTAydG8yanJyN2lsNDVyMzQifQ.YMU_zf_0bScIphRc_MDVtg'

IMG_OUTPUT_DIR = 'screenshots'

DB_CONF = dotenv_values(".env")

def _new_conn():
    conn = psycopg2.connect(user=DB_CONF['DB_USER'], password=DB_CONF['DB_PASSWORD'], database=DB_CONF['BIT_DB'])
    cur = conn.cursor()
    return conn, cur

@app.route("/", methods=['GET'])
def index():
    return render_template('index.html', mapbox_token=MAPBOX_TOKEN)

@app.route('/lots', methods=['POST'])
def lots():
    data = request.json
    print(data)
    _, cur = _new_conn()

    minx, miny = data['_sw'].values()
    maxx, maxy = data['_ne'].values()

    print(f"SELECT lots.gid, lots.id_provinc, ST_centroid(lots.geom), lots.no_lot, lots.utilisatio, lots.descriptio from lots where ST_CONTAINS(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326), lots.geom);")

    # cur.execute(f"""select json_build_object('type', 'FeatureCollection', 'features', 
    #             json_agg(json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(u.geom)::json))) from 
    #             (select st_union(array_agg(lots.geom)) as geom from lots where lots.gid 
    #                 in (1779609, 2366055, 2539026, 2665835, 2929669, 2983939, 3042392)) u;""")
    
    # cur.execute(f"""select json_build_object('type', 'FeatureCollection', 'features', 
    #             json_agg(json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(lots.geom)::json))) 
    #             from lots where lots.gid in (1149426, 2665835)""")
    #             # from lots where lots.gid in (1149426, 1779609, 2366055, 2539026, 2665835, 2929669, 2983939, 3042392)""")
    


    cur.execute(f"""
        select json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    'geometry', ST_AsGeoJSON(u.geom)::json,
                    'properties', json_build_object(
                        'lot_id', u.no_lot, 'util', u.util, 'usage', u.usage,
                        'num_dwel', num_dwel, 'unit_ids', unit_ids
                    ) 
                )
            )
        ) from (select no_lot, st_union(array_agg(geom)) as geom,
                sum(nb_logemen) as num_dwel, 
                mode() within group (order by utilisatio) as util,
                mode() within group (order by usag_predo) as usage,
                json_agg(id_provinc) as unit_ids
                from lots 
                where ST_CONTAINS(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326), geom) group by no_lot) as u ;""")



    # cur.execute(f"""
    #     select json_build_object(
    #         'type', 'FeatureCollection', 'features', 
    #         json_agg(
    #             json_build_object(
    #                 'type', 'Feature', 
    #                 'geometry', ST_AsGeoJSON(lots.geom)::json,
    #                 'properties', json_build_object(
    #                     'id', lots.gid, 'no', lots.no_lot, 'util', lots.utilisatio, 'desc', lots.descriptio
    #                 ) 
    #             )
    #         )
    #     ) from lots 
    #     where ST_CONTAINS(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326), lots.geom);""")

    # cur.execute(f"""select json_build_object('type', 'FeatureCollection',
    #                 'features', json_agg(json_build_object('type', 'Feature', 'geometry', 
    #                 ST_AsGeoJSON(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326))::json)));""")

    res = cur.fetchone()[0]
    # with open('t.json', 'r') as infile:
    #     res = json.load(infile)

    return res

