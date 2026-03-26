import json
import requests


def main():
    print("hello from python_file_google.py")
    try:
        resp = requests.get("https://google.com", timeout=10)
        print(
            json.dumps(
                {
                    "google": {
                        "status": resp.status_code,
                        "final_url": resp.url,
                        "length": len(resp.content[:4096]),
                    }
                },
                ensure_ascii=False,
            )
        )
    except Exception as e:
        print(json.dumps({"google": {"error": f"{type(e).__name__}: {e}"}}, ensure_ascii=False))


if __name__ == "__main__":
    main()

