import json
import sys


def main():
    print("hello from python_file_simple.py")
    print(json.dumps({"python_version": sys.version}, ensure_ascii=False))


if __name__ == "__main__":
    main()

