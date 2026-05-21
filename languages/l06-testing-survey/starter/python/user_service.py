import requests

class UserService:
    def get_avatar(self, user_id: str) -> str:
        """
        Sends an HTTP GET request to external API:
        "https://api.github.com/users/{user_id}"
        Extracts and returns the "avatar_url" string from the response JSON body.
        Raises ValueError if status_code is not 200.
        """
        # TODO: Implement REST API call with requests.get().
        # TODO: Validate response code. If not 200, raise ValueError("User not found").
        # TODO: Return parsed json_body["avatar_url"].
        return ""
