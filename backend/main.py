from fastapi import FastAPI

app = FastAPI()

@app.get("/api/estado")
def ver_estado():
    # Este es el JSON del que hablábamos ayer
    return {"socio": "Merlina", "estado": "Al día", "mensaje": "¡Tu primera API funciona!"}