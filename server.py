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



@app.route("/test", methods=['GET'])
def test2():
    return render_template('test.html', mapbox_token=MAPBOX_TOKEN, lot=None)

@app.route("/test/<id>", methods=['GET'])
def test(id):
    _, cur = _new_conn()

    cur.execute(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    'geometry', ST_AsGeoJSON(geom)::json
                )
            )
        )
        FROM lots WHERE id_provinc = %s""", (id,))
    res = cur.fetchone()[0]
    return render_template('test.html', mapbox_token=MAPBOX_TOKEN, lot=res)

@app.route("/get_lot", methods=['POST'])
def getLotAtPosition():
    data = request.json
    print(data)
    _, cur = _new_conn()

    cur.execute(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    'geometry', ST_AsGeoJSON(geom)::json,
                    'properties', json_build_object(
                        'id', lots.id_provinc
                    )
                )
            )
        )
        FROM lots lots where st_intersects(geom, ST_SetSRID(ST_MakePoint(%s, %s),4326));
    """, (data['lng'], data['lat'],))

    res = cur.fetchone()[0]
    return res

@app.route('/lots', methods=['POST'])
def lots():
    data = request.json
    # print(data)
    _, cur = _new_conn()

    minx, miny = data['_sw'].values()
    maxx, maxy = data['_ne'].values()

    # # V1.0 Fetches the lots based on them being within the map bounds
    # cur.execute(f"""
    #     select json_build_object(
    #         'type', 'FeatureCollection', 'features', 
    #         json_agg(
    #             json_build_object(
    #                 'type', 'Feature', 
    #                 'geometry', ST_AsGeoJSON(u.geom)::json,
    #                 'properties', json_build_object(
    #                     'lot_id', u.no_lot, 'util', u.util, 'usage', u.usage,
    #                     'num_dwel', num_dwel, 'unit_ids', unit_ids
    #                 ) 
    #             )
    #         )
    #     ) from (select no_lot, st_union(array_agg(geom)) as geom,
    #             sum(nb_logemen) as num_dwel, 
    #             mode() within group (order by utilisatio) as util,
    #             mode() within group (order by usag_predo) as usage,
    #             json_agg(id_provinc) as unit_ids
    #             from lots 
    #             where ST_CONTAINS(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326), geom) 
    #             group by no_lot) as u ;""")

    # V2.0 Fetches the lots based on the eval unit point being in the bounds AND extra conditions on eval unit
    cur.execute(f"""
        select json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    'geometry', ST_AsGeoJSON(res.lot_geom)::json,
                    'properties', json_build_object(
                        'id', res.id,
                        'hlms', res.hlms,
                        'ivp', res.avg_ivp
                    ) 
                )
            )
        ) from (
                select e.*, e.geom as lot_geom,
                json_agg(hlm.*) as hlms, round(avg(hlm.ivp)::numeric, 1) as avg_ivp
                from evalunits e
                join buildings_hlmbuilding hlm on hlm.eval_unit_id = e.id
                where ST_CONTAINS(ST_MakeEnvelope(%s, %s, %s, %s, 4326), e.geom)
                group by e.id
            ) as res;""", (minx, miny, maxx, maxy,))

    res = cur.fetchone()[0]

    return res


@app.route('/lot_info', methods=['POST'])
def lot_info():
    data = request.json
    print(data)
    _, cur = _new_conn()

    eval_unit_id = data['id']
    
    cur.execute(f"""
        select json_build_object(
            'id', e.id, 
            'address', e.address, 
            'num_adr_sup', e.num_adr_sup,
            'const_yr', e.const_yr, 
            'const_yr_real', e.const_yr_real, 
            'phys_link', e.phys_link,
            'const_type', e.const_type,
            'num_dwelling', e.num_dwelling,
            'max_floor', e.max_floors,
            'lot_area', e.lot_area,
            'lot_lin_dim', e.lot_lin_dim,
            'floor_area', e.floor_area,
            'lot_value', e.lot_value,
            'building_value', e.building_value,
            'value', e.value,
            'prev_value', e.prev_value,
            'owner_date', e.owner_date,
            'owner_type', e.owner_type,
            'owner_status', e.owner_status,
            'hlms', json_agg(
                json_build_object(
                    'id', hlm.id, 
                    'organism', hlm.organism, 
                    'address', concat(hlm.street_num, ' ', hlm.street_name)::text, 
                    'num_dwelling', hlm.num_dwellings, 
                    'num_floors', hlm.num_floors, 
                    'ivp', hlm.ivp, 
                    'disrepair_state', hlm.disrepair_state,
                    'category', hlm.category
                )
            )
        ) 
        from buildings_evalunit e 
        join buildings_hlmbuilding hlm on hlm.eval_unit_id = e.id
        where e.id = %s
        group by e.id, e.address;""", (eval_unit_id,))
    res = cur.fetchone()[0]

    return render_template('unit_info.j2', unit=res)


