import IPython
import psycopg2
from psycopg2 import sql
from dotenv import dotenv_values
from flask import Flask, render_template, request

app = Flask(__name__)
app.secret_key = b'_5#y2L"F4Qvsdsdufndsuifvbsivbvdubff/'

MAPBOX_TOKEN = 'pk.eyJ1IjoibG9sb3ZvbmhvIiwiYSI6ImNsb2QxdDczeTAydG8yanJyN2lsNDVyMzQifQ.YMU_zf_0bScIphRc_MDVtg'

IMG_OUTPUT_DIR = 'screenshots'

ENV = dotenv_values(".env")
EVALUNIT_TABLE = ENV['EVALUNIT_TABLE']
HLM_TABLE = ENV['HLM_TABLE']
LOT_TABLE = ENV['LOT_TABLE']

def _new_conn():
    conn = psycopg2.connect(host=ENV['DB_HOST'], port=ENV['DB_PORT'], user=ENV['DB_USER'], password=ENV['DB_PW'], database=ENV['DB_NAME'])
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
        FROM {LOT_TABLE} WHERE id_provinc = %s""", (id,))
    res = cur.fetchone()[0]
    return render_template('test.html', mapbox_token=MAPBOX_TOKEN, lot=res)


@app.route("/get_hlms", methods=['GET', 'POST'])
def get_hlms():
    conn, cur = _new_conn()

    select = sql.SQL(f"""
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
        ) FROM {HLM_TABLE}""")
    
    if request.method == 'POST':
        data = request.json
        # ivp_range_min = data['filter']['ivpRangeMin']
        # ivp_range_max = data['filter']['ivpRangeMax']
        dwellings_min = data['filter']['dwellingsMin']
        dwellings_max = data['filter']['dwellingsMax']
        disrepair_categories = data['filter']['disrepairCategories'] or 'null'

        where_clause_parts = []
        where_clause_parts.append(_get_disrepair_category_filter(disrepair_categories))
        where_clause_parts.append(_get_dwellings_filter(dwellings_min, dwellings_max))
        where_clause = sql.SQL(' AND ').join(where_clause_parts)

        query = sql.SQL("{select} WHERE {where_clause}").format(
            select=select,
            where_clause=where_clause
        )
        cur.execute(query)

    else:
        cur.execute(select)

    res = cur.fetchone()[0]

    # Needed so we can display no data
    if res['features'] is None:
        res['features'] = []

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
        FROM {LOT_TABLE} lots where st_intersects(geom, ST_SetSRID(ST_MakePoint(%s, %s),4326));
    """, (data['lng'], data['lat'],))

    res = cur.fetchone()[0]
    return res


def _get_disrepair_category_filter(disrepair_categories):
    return sql.SQL("disrepair_state IN ({disrepair_categories})").format(
        disrepair_categories=sql.SQL(", ").join(
            [sql.Literal(c) for c in disrepair_categories] if disrepair_categories else sql.SQL('Null')
        )
    )

def _get_dwellings_filter(dwellings_min, dwellings_max):
    return sql.SQL(
        'num_dwellings between {dwellings_min} and {dwellings_max}'
    ).format(
        dwellings_min=sql.Literal(dwellings_min),
        dwellings_max=sql.Literal(dwellings_max),
    )

@app.route('/get_lots', methods=['POST'])
def get_lots():
    data = request.json
    _, cur = _new_conn()

    minx, miny = data['bounds']['_sw'].values()
    maxx, maxy = data['bounds']['_ne'].values()
    # ivp_range_min = data['filter']['ivpRangeMin']
    # ivp_range_max = data['filter']['ivpRangeMax']
    dwellings_min = data['filter']['dwellingsMin']
    dwellings_max = data['filter']['dwellingsMax']
    disrepair_categories = data['filter']['disrepairCategories'] or 'null'

    select_from = sql.SQL("""
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
                json_agg(h.*) as hlms, round(avg(h.ivp)::numeric, 1) as avg_ivp,
                json_agg(h.num_dwellings) as num_dwellings
                from {evalunit_table} e
                join {hlm_table} h on h.eval_unit_id = e.id
                {where_clause}
                GROUP BY e.id
        ) as res;""")
    
    where_clause_parts = []
    where_clause_parts.append(
        sql.SQL("WHERE ST_INTERSECTS(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326), h.point)")
            .format(
                minx=sql.Literal(minx), 
                miny=sql.Literal(miny), 
                maxx=sql.Literal(maxx), 
                maxy=sql.Literal(maxy))
    )
    where_clause_parts.append(_get_disrepair_category_filter(disrepair_categories))
    where_clause_parts.append(_get_dwellings_filter(dwellings_min, dwellings_max))
    where_clause = sql.SQL(' AND ').join(where_clause_parts)
    
    query = select_from.format(
        evalunit_table=sql.Identifier(EVALUNIT_TABLE),
        hlm_table=sql.Identifier(HLM_TABLE),
        where_clause=where_clause
    )
    cur.execute(query)
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
        from {EVALUNIT_TABLE} e 
        join {HLM_TABLE} hlm on hlm.eval_unit_id = e.id
        where e.id = %s
        group by e.id, e.address;""", (eval_unit_id,))
    res = cur.fetchone()[0]

    return render_template('unit_info.j2', unit=res)


