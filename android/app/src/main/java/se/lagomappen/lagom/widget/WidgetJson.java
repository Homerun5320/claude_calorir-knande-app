package se.lagomappen.lagom.widget;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Den enda koden som använder org.json: tolkar widgetens JSON-text till Map/List, som
 * {@link WidgetPayload#fromMap(Object)} sedan kontrollerar. Hålls liten, eftersom org.json bara
 * finns som stubbar i lokala enhetstester (all logik testas på Map/List i stället).
 */
final class WidgetJson {

    private WidgetJson() {}

    /**
     * Tolka och kontrollera JSON-texten. Längden och nästlingsdjupet kontrolleras före tolkningen.
     *
     * @throws WidgetPayload.InvalidPayloadException vid ogiltig data – med ett fast meddelande
     *     (org.jsons felmeddelanden citerar innehållet och följer aldrig med)
     */
    static WidgetPayload parse(String json) throws WidgetPayload.InvalidPayloadException {
        WidgetPayload.checkText(json);
        Object root;
        try {
            JSONTokener tokener = new JSONTokener(json);
            root = tokener.nextValue();
            // Inget annat än blanktecken efter objektet.
            if (tokener.nextClean() != 0) throw new WidgetPayload.InvalidPayloadException("Widgetdatan är inte giltig JSON");
        } catch (JSONException e) {
            throw new WidgetPayload.InvalidPayloadException("Widgetdatan är inte giltig JSON");
        }
        return WidgetPayload.fromMap(toJava(root));
    }

    /** JSONObject → LinkedHashMap, JSONArray → ArrayList, JSONObject.NULL → null; övrigt som det är. */
    static Object toJava(Object value) throws WidgetPayload.InvalidPayloadException {
        if (value == null || value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            Map<String, Object> map = new LinkedHashMap<>();
            Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                map.put(key, toJava(object.opt(key)));
            }
            return map;
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            List<Object> list = new ArrayList<>(array.length());
            for (int i = 0; i < array.length(); i++) list.add(toJava(array.opt(i)));
            return list;
        }
        if (value instanceof String || value instanceof Number || value instanceof Boolean) return value;
        throw new WidgetPayload.InvalidPayloadException("Okänd typ i widgetdatan");
    }
}
