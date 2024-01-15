import os
import IPython
import psycopg2
import psycopg2.extras

from psycopg2 import sql
from dotenv import load_dotenv
from flask import Flask, render_template, request

app = Flask(__name__)

load_dotenv(".env")

DB_USER = os.getenv('DB_USER')
DB_PW = os.getenv('DB_PW')
DB_NAME = os.getenv('DB_NAME')
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
EVALUNIT_TABLE = os.getenv('EVALUNIT_TABLE')
HLM_TABLE = os.getenv('HLM_TABLE') 
LOT_TABLE = os.getenv('LOT_TABLE')
MAPBOX_TOKEN = os.getenv('MAPBOX_TOKEN')
app.secret_key = os.getenv('SECRET_KEY')

ALL_SC_IDS = {
    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37
}
# This is actually all MRCs that contain HLMs
ALL_MRC_IDS = {
    5, 21, 23, 24, 27, 40, 41, 46, 53, 54, 55, 56, 57, 58, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 
    73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 
    121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 
    142, 143, 144, 157, 159
}


def _new_conn(dict_cursor=False):
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PW, database=DB_NAME)
    if dict_cursor:
        return conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    return conn, conn.cursor()


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
                    'geometry', geom::json
                )
            )
        )
        FROM {LOT_TABLE} WHERE id_provinc = %s""", (id,))
    res = cur.fetchone()[0]
    return render_template('test.html', mapbox_token=MAPBOX_TOKEN, lot=res)




@app.get('/hlms_by_mrc')
def get_hlms_by_mrc():
    _, cur = _new_conn(dict_cursor=True)

    select = f"""SELECT 
                m.id as mrc_id,
                m.name as mrc_name,
                json_build_object(
                    'type', 'FeatureCollection', 'features', 
                    json_agg(
                        json_build_object(
                            'type', 'Feature', 
                            'geometry', ST_AsGeoJSON(point)::json,
                            'properties', json_build_object(
                                'id', h.id,
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
                ) as hlms FROM mrcs m JOIN hlms h on ST_INTERSECTS(h.point, m.geom)
        GROUP BY m.gid;"""
    cur.execute(select)
    res = cur.fetchall()

    return res



@app.route('/hlm_clusters_by_mrc', methods=['GET', 'POST'])
def get_hlm_clusters_by_mrc():
    """
    Return a single point per MRC 
    with a breakdown of the ivp classes and summary statistics
    """
    _, cur = _new_conn(dict_cursor=True)

    select = sql.SQL(f"""
        SELECT 
        --- Create a unique id for each service center group
        --- See https://stackoverflow.com/questions/53508828/postgres-create-id-for-groups
        m.id as id,
        m.name as name,
        json_build_object(
            'type', 'Feature', 
            'geometry', ST_Centroid(m.geom)::json
        ) as p,
        json_agg(
            json_build_object(
                's', h.disrepair_state,
                'dwel', h.num_dwellings
            )
        ) as ivps
        FROM mrcs m JOIN hlms h on ST_INTERSECTS(h.point, m.geom)
    """)
    group_by_clause = sql.SQL("m.id, m.name")

    if request.method == 'POST':
        data = request.json
        dwellings_min = data['filter']['dwellingsMin']
        dwellings_max = data['filter']['dwellingsMax']
        disrepair_categories = data['filter']['disrepairCategories']

        where_clause_parts = []
        where_clause_parts.append(get_disrepair_category_filter(disrepair_categories))
        where_clause_parts.append(get_dwellings_filter(dwellings_min, dwellings_max))
        where_clause = sql.SQL(' AND ').join(where_clause_parts)

        query = sql.SQL("{select} WHERE {where_clause} GROUP BY {group_by_clause}").format(
            select=select,
            where_clause=where_clause,
            group_by_clause=group_by_clause
        )
    else:
        query = sql.SQL("{select} GROUP BY {group_by_clause}").format(
            select=select,
            group_by_clause=group_by_clause
        )

    cur.execute(query)
    res = cur.fetchall()


    return res




@app.route('/hlm_clusters_by_sc', methods=['GET', 'POST'])
def get_hlm_clusters_by_sc():   
    """
    Return a single point per service center
    With a breakdown of the ivp classes and summary statistics
    """
    _, cur = _new_conn(dict_cursor=True)

    select = sql.SQL(f"""
        SELECT 
        s.id,
        s.name,
        json_build_object(
            'type', 'Feature', 
            'geometry', ST_Centroid(s.geom)::json,
            'properties', json_build_object(
                'id', s.id
            )
        ) as p, 
        json_agg(
            json_build_object(
                's', h.disrepair_state,
                'dwel', h.num_dwellings
            )
        ) as ivps
        FROM hlms h JOIN sc s on h.service_center = s.name
    """)
    group_by_clause = sql.SQL("s.id, s.name")
    
    if request.method == 'POST':
        data = request.json
        dwellings_min = data['filter']['dwellingsMin']
        dwellings_max = data['filter']['dwellingsMax']
        disrepair_categories = data['filter']['disrepairCategories']

        where_clause_parts = []
        where_clause_parts.append(get_dwellings_filter(dwellings_min, dwellings_max))
        if disrepair_categories:
            where_clause_parts.append(get_disrepair_category_filter(disrepair_categories))

        where_clause = sql.SQL(' AND ').join(where_clause_parts)
        # print(where_clause.as_string(_))

        query = sql.SQL("{select} WHERE {where_clause} GROUP BY {group_by_clause}").format(
            select=select,
            where_clause=where_clause,
            group_by_clause=group_by_clause
        )
    else:
        query = sql.SQL("{select} GROUP BY {group_by_clause}").format(
            select=select,
            group_by_clause=group_by_clause
        )

    cur.execute(query)
    res = cur.fetchall()

    return res



@app.get('/sc_polygons')
def get_service_center_polygons():
    _, cur = _new_conn(dict_cursor=True)

    select = f"""
        SELECT json_build_object(
                    'type', 'Feature', 
                    'geometry', geom::json,
                    'properties', json_build_object(
                        'id', id,
                        'name', name,
                        --- ST_Envelope returns: ((MINX, MINY), (MINX, MAXY), (MAXX, MAXY), (MAXX, MINY), (MINX, MINY))
                        --- Mapbox needs minx, miny and maxx, maxy
                        'bbox_sw', ST_Envelope(geom)::json->'coordinates'->0->0,
                        'bbox_ne', ST_Envelope(geom)::json->'coordinates'->0->2
                    )
                ) as json
        FROM sc 
        --- we order by area descending because the polygons overlap
        --- and the smaller ones might get fully covered by larger ones
        ORDER BY area DESC;"""
    cur.execute(select)
    res = cur.fetchall()

    # Manually create the returned JSON object
    res_json = {
        'type': 'FeatureCollection',
        'features': []
    }
    for i, r in enumerate(res):
        res_json['features'].append(r['json'])

    return res_json



@app.get('/mrc_polygons')
def get_mrc_polygons():
    _, cur = _new_conn()

    select = f"""
        SELECT json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    --- the simplify call reduces the size of polygons significantly
                    'geometry', ST_Simplify(sq.geom, 0.0005)::json,
                    'properties', json_build_object(
                        'id', sq.id,
                        'name', sq.name,
                        --- ST_Envelope returns: ((MINX, MINY), (MINX, MAXY), (MAXX, MAXY), (MAXX, MINY), (MINX, MINY))
                        --- Mapbox needs minx, miny and maxx, maxy
                        'bbox_sw', ST_Envelope(geom)::json->'coordinates'->0->0,
                        'bbox_ne', ST_Envelope(geom)::json->'coordinates'->0->2
                    )
                )
            )
        ) 
        FROM 
        --- This subquery disregards MRCs without any HLMs
        (
            SELECT m.id AS id, m.name AS name, m.geom AS geom 
            FROM mrcs m JOIN hlms h ON ST_Intersects(m.geom, h.point)
            GROUP BY m.id, m.name, m.geom
            ORDER BY name ASC
        ) as sq
        """
    
    cur.execute(select)

    res = cur.fetchone()[0]
    return res


@app.route('/get_area_info', methods=['POST'])
def get_area_info():
    conn, cur = _new_conn()

    data = request.json
    id = data['id']
    type = data['type']

    if type == 'mrc':
        join_clause = f"JOIN mrcs a ON ST_Intersects(a.geom, h.point)"
    else:
        join_clause = f"JOIN sc a ON h.service_center = a.name"

    select = sql.SQL(f"""
        SELECT a.id, a.name, 
        json_agg(
            json_build_object(
                's', h.disrepair_state,
                'dwel', h.num_dwellings
            )
        ) as ivps
        FROM {HLM_TABLE} h 
        {join_clause}
        WHERE a.id = {id}
    """)

    cur.execute(select)
    res = cur.fetchone()[0]
    
    return render_template('area_info.j2', area=res)




@app.route("/get_hlms", methods=['GET', 'POST'])
def get_hlms():
    conn, cur = _new_conn()

    select = sql.SQL(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    'geometry', ST_AsGeoJSON(hlm.point)::json,
                    'properties', json_build_object(
                        'id', hlm.id,
                        'eval_unit_id', hlm.eval_unit_id, 
                        'address', hlm.address, 
                        'ivp', hlm.ivp,
                        'num_dwellings', hlm.num_dwellings 
                    )
                )
            )
        ) FROM {HLM_TABLE} hlm """)
    
    if request.method == 'POST':
        data = request.json
        dwellings_min = data['filter']['dwellingsMin']
        dwellings_max = data['filter']['dwellingsMax']
        disrepair_categories = data['filter']['disrepairCategories']
        mrc_ids = set(data['filter']['spatialFilter']['mrc'])
        sc_ids = set(data['filter']['spatialFilter']['sc'])
        join_clause_parts = []
        
        where_clause_parts = []
        where_clause_parts.append(get_dwellings_filter(dwellings_min, dwellings_max))

        if disrepair_categories:
            where_clause_parts.append(get_disrepair_category_filter(disrepair_categories))

        # Process the spatial filters
        mrc_and_sc_filter_parts = []

        # If both sets are empty - we should show NO data
        if not mrc_ids and not sc_ids:
            where_clause_parts.append(sql.SQL('hlm.id in (null)'))

        # If either set is full - we should not do any spatial filtering
        elif mrc_ids == ALL_MRC_IDS or sc_ids == ALL_SC_IDS:
            pass

        else:
            # One of the sets is not empty, and none is full
            # We add the spatial joins progressively, based on which 
            # sets are present as they incur a large cost in query time
            if mrc_ids:
                join_clause_parts.append(sql.SQL('JOIN mrcs mrc ON ST_Intersects(mrc.geom, hlm.point)'))
                mrc_and_sc_filter_parts.append(get_mrc_filter(mrc_ids))
            if sc_ids:
                join_clause_parts.append(sql.SQL('JOIN sc ON hlm.service_center = sc.name'))
                mrc_and_sc_filter_parts.append(get_sc_filter(sc_ids))

            if mrc_and_sc_filter_parts:
                mrc_and_sc_clause = sql.SQL(' OR ').join(mrc_and_sc_filter_parts)
                where_clause_parts.append(sql.SQL("({mrc_and_sc_clause})").format(
                    mrc_and_sc_clause=mrc_and_sc_clause
                ))

        join_clause = sql.SQL(' ').join(join_clause_parts)
        where_clause = sql.SQL(' AND ').join(where_clause_parts)

        query = sql.SQL("{select} {join_clause} WHERE {where_clause}").format(
            select=select,
            join_clause=join_clause,
            where_clause=where_clause
        )
    else:
        query = select

    cur.execute(query)
    res = cur.fetchone()[0]

    # Needed so we can display no data
    if res['features'] is None:
        res['features'] = []

    # print(query.as_string(conn))
    # print(len(res['features']))

    return res


@app.route("/get_lot", methods=['POST'])
def getLotAtPosition():
    data = request.json
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
        FROM {LOT_TABLE} lots where ST_Intersects(geom, ST_SetSRID(ST_MakePoint(%s, %s),4326));
    """, (data['lng'], data['lat'],))

    res = cur.fetchone()[0]
    return res


def get_disrepair_category_filter(disrepair_categories):
    return sql.SQL("disrepair_state IN ({disrepair_categories})").format(
        disrepair_categories=sql.SQL(", ").join(
            [sql.Literal(c) for c in disrepair_categories]
        ) if disrepair_categories else sql.SQL('null')
    )


def get_dwellings_filter(dwellings_min, dwellings_max):
    return sql.SQL(
        'num_dwellings between {dwellings_min} and {dwellings_max}'
    ).format(
        dwellings_min=sql.Literal(dwellings_min),
        dwellings_max=sql.Literal(dwellings_max),
    )

def get_mrc_filter(mrc_ids):
    return sql.SQL("mrc.id IN ({mrc_ids})").format(
        mrc_ids=sql.SQL(", ").join(
            [sql.Literal(c) for c in mrc_ids] 
        ) if mrc_ids else sql.SQL('null')
    )

def get_sc_filter(sc_ids):
    return sql.SQL("sc.id IN ({sc_ids})").format(
        sc_ids=sql.SQL(", ").join(
            [sql.Literal(c) for c in sc_ids] 
        ) if sc_ids else sql.SQL('null')
    )


@app.route('/get_lots', methods=['POST'])
def get_lots():
    data = request.json
    conn, cur = _new_conn()

    minx, miny = data['bounds']['_sw'].values()
    maxx, maxy = data['bounds']['_ne'].values()
    dwellings_min = data['filter']['dwellingsMin']
    dwellings_max = data['filter']['dwellingsMax']
    disrepair_categories = data['filter']['disrepairCategories']
    mrc_ids = set(data['filter']['spatialFilter']['mrc'])
    sc_ids = set(data['filter']['spatialFilter']['sc'])

    
    select_from = sql.SQL("""
        select json_build_object(
            'type', 'FeatureCollection', 'features', 
            json_agg(
                json_build_object(
                    'type', 'Feature', 
                    'geometry', ST_AsGeoJSON(res.geom)::json,
                    'properties', json_build_object(
                        'id', res.id,
                        'hlms', res.hlms,
                        'ivp', res.avg_ivp,
                        'num_dwellings', res.num_dwellings
                    ) 
                )
            )
        ) from (
                select e.*, e.lot_geom as geom,
                json_agg(h.*) as hlms, round(avg(h.ivp)::numeric, 1) as avg_ivp,
                json_agg(h.num_dwellings) as num_dwellings
                from {evalunit_table} e
                {join_clause}
                {where_clause}
                GROUP BY e.id
        ) as res;""")
    
    # Already know we want to join on hlms
    join_clause_parts = [sql.SQL("JOIN hlms h on h.eval_unit_id = e.id")]

    where_clause_parts = []
    # Only return lots of HLMs within the current viewport
    where_clause_parts.append(
        sql.SQL("WHERE ST_Intersects(ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy}, 4326), h.point)")
            .format(
                minx=sql.Literal(minx), 
                miny=sql.Literal(miny), 
                maxx=sql.Literal(maxx), 
                maxy=sql.Literal(maxy))
    )
    where_clause_parts.append(get_disrepair_category_filter(disrepair_categories))
    where_clause_parts.append(get_dwellings_filter(dwellings_min, dwellings_max))


    # Process the spatial filters
    mrc_and_sc_filter_parts = []

    # If both sets are empty - we should show NO data
    if not mrc_ids and not sc_ids:
        where_clause_parts.append(sql.SQL('h.id in (null)'))

    # If either set is full - we should not do any spatial filtering
    elif mrc_ids == ALL_MRC_IDS or sc_ids == ALL_SC_IDS:
        pass

    else:
        # One of the sets is not empty, and none is full
        # We add the spatial joins progressively, based on which 
        # sets are present as they incur a large cost in query time
        if mrc_ids:
            join_clause_parts.append(sql.SQL('JOIN mrcs mrc ON ST_Intersects(mrc.geom, h.point)'))
            mrc_and_sc_filter_parts.append(get_mrc_filter(mrc_ids))
        if sc_ids:
            join_clause_parts.append(sql.SQL('JOIN sc ON h.service_center = sc.name'))
            mrc_and_sc_filter_parts.append(get_sc_filter(sc_ids))

        if mrc_and_sc_filter_parts:
            mrc_and_sc_clause = sql.SQL(' OR ').join(mrc_and_sc_filter_parts)
            where_clause_parts.append(sql.SQL("({mrc_and_sc_clause})").format(
                mrc_and_sc_clause=mrc_and_sc_clause
            ))

    join_clause = sql.SQL(' ').join(join_clause_parts)
    where_clause = sql.SQL(' AND ').join(where_clause_parts)

    
    query = select_from.format(
        evalunit_table=sql.Identifier(EVALUNIT_TABLE),
        join_clause=join_clause,
        where_clause=where_clause
    )
    cur.execute(query)
    res = cur.fetchone()[0]

    if res['features'] is None:
        res['features'] = []

    # print(query.as_string(conn))
    # print(len(res['features']))

    return res


@app.route('/lot_info', methods=['POST'])
def lot_info():
    data = request.json
    # print(data)
    _, cur = _new_conn()

    eval_unit_id = data['id']
    
    cur.execute(f"""
        select json_build_object(
            'id', e.id, 
            'address', e.address,
            'lot_number', e.lot_id,
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


if __name__ == '__main__':
    conn, cur = _new_conn()
    IPython.embed()
