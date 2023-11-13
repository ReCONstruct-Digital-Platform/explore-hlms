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
    _, cur = _new_conn()
    cur.execute(f"""SELECT min(ivp), max(ivp), min(num_dwellings), max(num_dwellings) FROM hlms;""")
    res = cur.fetchone()

    return render_template(
        'index.html',
        ivp_min = res[0],
        ivp_max = res[1] + 1,
        dwellings_min = res[2], 
        dwellings_max = res[3] + 1,
        mapbox_token=MAPBOX_TOKEN
    )



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


@app.route("/get_hlms", methods=['GET', 'POST'])
def get_hlms():
    _, cur = _new_conn()
    
    if request.method == 'POST':
        data = request.json
        print(data)
        ivp_range_min = data['filter']['ivpRangeMin']
        ivp_range_max = data['filter']['ivpRangeMax']
        dwellings_range_min = data['filter']['dwellingsRangeMin']
        dwellings_range_max = data['filter']['dwellingsRangeMax']

        # TODO: SANITIZE THIS
        # -- I think cursor.execute() will sanitize the input
        # Once we intergrate in Django, we can use the ORM
        cur.execute(f"""
            SELECT json_build_object(
                'type', 'FeatureCollection', 'features', 
                json_agg(
                    json_build_object(
                        'type', 'Feature', 
                        'geometry', ST_AsGeoJSON(point)::json,
                        'properties', json_build_object(
                            'id', id,
                            'eval_unit_id', eval_unit_id, 
                            'organism', organism, 
                            'service_center', service_center, 
                            'address', address, 
                            'muni', muni, 
                            'num_dwellings', num_dwellings, 
                            'num_floors', num_floors, 
                            'area_footprint', area_footprint, 
                            'area_total', area_total, 
                            'ivp', ivp, 
                            'disrepair_state', disrepair_state, 
                            'category', category
                        )
                    )
                )
            ) FROM hlms
            WHERE ivp between %s and %s
            AND num_dwellings between %s and %s; 
        """, (ivp_range_min, ivp_range_max, dwellings_range_min, dwellings_range_max,))

    else:
        cur.execute(f"""
            SELECT json_build_object(
                'type', 'FeatureCollection', 'features', 
                json_agg(
                    json_build_object(
                        'type', 'Feature', 
                        'geometry', ST_AsGeoJSON(point)::json,
                        'properties', json_build_object(
                            'id', id,
                            'eval_unit_id', eval_unit_id, 
                            'organism', organism, 
                            'service_center', service_center, 
                            'address', address, 
                            'muni', muni, 
                            'num_dwellings', num_dwellings, 
                            'num_floors', num_floors, 
                            'area_footprint', area_footprint, 
                            'area_total', area_total, 
                            'ivp', ivp, 
                            'disrepair_state', disrepair_state, 
                            'category', category
                        )
                    )
                )
            ) FROM hlms;
        """)
    res = cur.fetchone()[0]

    return res

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

@app.route('/get_lots', methods=['POST'])
def get_lots():
    data = request.json
    _, cur = _new_conn()

    minx, miny = data['bounds']['_sw'].values()
    maxx, maxy = data['bounds']['_ne'].values()
    ivp_range_min = data['filter']['ivpRangeMin']
    ivp_range_max = data['filter']['ivpRangeMax']
    dwellings_range_min = data['filter']['dwellingsRangeMin']
    dwellings_range_max = data['filter']['dwellingsRangeMax']

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
                        'ivp', res.avg_ivp,
                        'num_dwellings', res.num_dwellings
                    ) 
                )
            )
        ) from (
                select e.*, e.geom as lot_geom,
                json_agg(hlm.*) as hlms, round(avg(hlm.ivp)::numeric, 1) as avg_ivp,
                json_agg(hlm.num_dwellings) as num_dwellings
                from evalunits e
                join hlms hlm on hlm.eval_unit_id = e.id
                where ST_INTERSECTS(ST_MakeEnvelope(%s, %s, %s, %s, 4326), hlm.point)
                AND hlm.ivp between %s and %s
                AND hlm.num_dwellings between %s and %s
                group by e.id
            ) as res;""", 
        (minx, miny, maxx, maxy, ivp_range_min, ivp_range_max, dwellings_range_min, dwellings_range_max))
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
            'lot_number', e.lot_number,
            'muni', e.muni,
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
            'owner_date', TO_CHAR(e.owner_date, 'dd/mm/yyyy'),
            'owner_type', e.owner_type,
            'owner_status', e.owner_status,
            'hlms', json_agg(
                json_build_object(
                    'id', hlm.id, 
                    'organism', hlm.organism,
                    'service_center', hlm.service_center,
                    'address', concat(hlm.street_num, ' ', hlm.street_name)::text, 
                    'num_dwelling', hlm.num_dwellings, 
                    'num_floors', hlm.num_floors, 
                    'ivp', hlm.ivp, 
                    'disrepair_state', hlm.disrepair_state,
                    'category', hlm.category
                )
            )
        ) 
        from evalunits e 
        join hlms hlm on hlm.eval_unit_id = e.id
        where e.id = %s
        group by e.id, e.address;""", (eval_unit_id,))
    res = cur.fetchone()[0]

    return render_template('unit_info.j2', unit=res)


