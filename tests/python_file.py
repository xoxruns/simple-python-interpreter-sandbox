import json
import sys
import requests


def main():
    print("hello from python_file.py")
    print(json.dumps({"python_version": sys.version}, ensure_ascii=False))

    # Simple network check using requests
    try:
        resp = requests.get("https://duckduckgo.com", timeout=10)
        content_preview = resp.content[:4096]
        print(
            json.dumps(
                {
                    "duckduckgo": {
                        "status": resp.status_code,
                        "length": len(content_preview),
                    }
                },
                ensure_ascii=False,
            )
        )
    except Exception as e:
        print(json.dumps({"duckduckgo": {"error": f"{type(e).__name__}: {e}"}}, ensure_ascii=False))


if __name__ == "__main__":
    main()

